var grid,
  config,
  layers,
  columns,
  rows,
  currentLayer,
  currentButton,
  editor,
  files = {},
  currentFile = "css",
  exeEditor,
  isExeChanging = false;
let configFetcher = fetch("./api/config").then((e) => e.json());

window.addEventListener("fullyLoaded", async function () {
  if (grid) return;
  GridStack.renderCB = function (el, w) {
    el.innerHTML = w.content;
  };
  grid = GridStack.init({
    row: 6,
    column: 9,
    float: true,
  });
  const inLogin = document.querySelector(".login #in_login");
  const btnLogin = document.querySelector(".login #btn_login");
  function auth(password) {
    spinner();
    if (password !== null) configFetcher = fetch("./api/config", {
      headers: {
        Authorization: password,
      },
    }).then((e) => e.json())
    configFetcher.then(async (res) => {
      columns = res.layout.gridColumns;
      rows = res.layout.gridRows;
      config = res;
      layers = res.layout.layers;
      layer(1);
      document.querySelector("#in_grid_row").value = rows;
      document.querySelector("#in_grid_col").value = columns;

      spinner(false);
      document.querySelector(".login").style.display = null;
      // This was moved here to prevent unauthenticated executable fetching
      initEditor();
    }).catch(() => {
      spinner(false);
      if (password) document.querySelector("#diag_login_failed").toast();
      document.querySelector(".login").style.display = "block";
      inLogin.focus();
    });
  }
  auth();
  inLogin.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      btnLogin.click();
    }
  });
  btnLogin.addEventListener("click", () => {
    auth(inLogin.value);
  });
  var timeout;
  window.addEventListener(
    "resize",
    () => (
      clearTimeout(timeout), (timeout = setTimeout(refreshCellHeight, 100))
    )
  );
  // Dialogs
  const layerDialog = document.querySelector("#diag_layer");
  document
    .querySelector(".statbar > #layer")
    .addEventListener("click", () => layerDialog.show());
  layerDialog
    .querySelector("#btn_layer")
    .addEventListener("click", function (e) {
      layerDialog.hide();
      layer(document.querySelector("#in_layer").value);
    });
  const gridDialog = document.querySelector("#diag_grid");
  document
    .querySelector(".statbar > #grid")
    .addEventListener("click", () => gridDialog.show());
  gridDialog
    .querySelector("#btn_apply")
    .addEventListener("click", function (e) {
      columns = document.querySelector("#in_grid_col").value;
      rows = document.querySelector("#in_grid_row").value;
      config.layout.gridColumns = columns;
      config.layout.gridRows = rows;
      resize(columns, rows);
      gridDialog.hide();
    });

  // Button configurations
  const inButtonId = document.querySelector("#in_button_id");
  const inButtonText = document.querySelector("#in_button_text");
  const inButtonClass = document.querySelector("#in_button_class");
  const inButtonType = document.querySelector("#in_button_type");
  const inCondActType = document.querySelector("#in_cond_act_type");
  const inCondActName = document.querySelector("#in_cond_act_name");
  const inCondDepType = document.querySelector("#in_cond_dep_type");
  const inCondDepName = document.querySelector("#in_cond_dep_name");
  const btnButtonDelete = document.querySelector("#btn_button_delete");
  const btnSave = document.querySelector(".statbar > div#save");
  const successToast = document.querySelector("#diag_saved");
  const failedToast = document.querySelector("#diag_failed");
  const scriptTree = document.querySelector("#tree_script");
  const exeList = scriptTree.querySelector("#exe");

  btnSave.addEventListener("click", function () {
    spinner();
    config.layout.layers = layers;
    Promise.all([
      fetch("./api/config", {
        method: "POST",
        body: JSON.stringify(config),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      ...Object.entries(files).map(([k, v]) =>
        fetch("./api/exe/" + k, {
          method: "POST",
          body: JSON.stringify({ v }),
          headers: {
            "Content-Type": "application/json",
          },
        })
      ),
    ])
      .then((res) => {
        if (res.find((e) => e.status !== 200)) throw "Returned status isn't OK";
        successToast.toast();
        btnSave.classList.remove("unsaved");
      })
      .catch((e) => {
        failedToast.toast();
        console.error(e);
      }).finally(() => spinner(false));
    files = { css: files?.css };
    scanCss();
  });

  function markUnsaved() {
    btnSave.classList.add("unsaved");
  }
  async function initSidebar() {
    inButtonId.addEventListener("sl-input", function () {
      if (currentButton) {
        const l = layers[currentLayer];
        const data = l.find((e) => e.id == currentButton);
        data.id = inButtonId.value;
        layer(currentLayer);
        markUnsaved();
      }
    });
    inButtonText.addEventListener("sl-input", function () {
      if (currentButton) {
        const l = layers[currentLayer];
        const data = l.find((e) => e.id == currentButton);
        data.displayText = inButtonText.value;
        layer(currentLayer);
        markUnsaved();
      }
    });
    inButtonClass.addEventListener("sl-change", function () {
      if (currentButton) {
        const l = layers[currentLayer];
        const data = l.find((e) => e.id == currentButton);
        data.class = inButtonClass.value.join(" ");
        layer(currentLayer);
        markUnsaved();
      }
    });
    inButtonType.addEventListener("sl-change", function () {
      if (currentButton) {
        const l = layers[currentLayer];
        const data = l.find((e) => e.id == currentButton);
        data.type = inButtonType.value;
        markUnsaved();
      }
    });
    function updateActions() {
      if (currentButton) {
        const layer = layers[currentLayer];
        const data = layer.find((e) => e.id == currentButton);
        if (!data.conditions) data.conditions = {};
        if (inCondActType.value == "add") {
          data.conditions.add = inCondActName.value;
        } else if (inCondActType.value == "remove") {
          data.conditions.remove = inCondActName.value;
        } else if (data.conditions) {
          delete data.conditions.add;
          delete data.conditions.remove;
        }
        if (Object.keys(data.conditions).length == 0) delete data.conditions;
        markUnsaved();
      }
    }
    inCondActName.addEventListener("sl-change", updateActions);
    inCondActType.addEventListener("sl-change", updateActions);
    function updateDependencies() {
      if (currentButton) {
        const layer = layers[currentLayer];
        const data = layer.find((e) => e.id == currentButton);
        if (!data.conditions) data.conditions = {};
        if (inCondDepType.value == "if") {
          data.conditions.if = inCondDepName.value;
        } else if (inCondDepType.value == "no") {
          data.conditions.no = inCondDepName.value;
        } else if (data.conditions) {
          delete data.conditions.if;
          delete data.conditions.no;
        }
        if (Object.keys(data.conditions).length == 0) delete data.conditions;
        markUnsaved();
      }
    }
    inCondDepName.addEventListener("sl-change", updateDependencies);
    inCondDepType.addEventListener("sl-change", updateDependencies);
    btnButtonDelete.addEventListener("click", function (e) {
      if (!currentButton) return;
      const l = layers[currentLayer];
      const index = l.findIndex((e) => e.id == currentButton);
      l.splice(index, 1);
      layer(currentLayer);
      markUnsaved();
      currentButton = null;
    });

    exeEditor = ace.edit("ace_exe");
    exeEditor.setTheme("ace/theme/chaos");
    exeEditor.session.setMode("ace/mode/json");
    exeEditor.on("input", function () {
      if (isExeChanging) return (isExeChanging = false);
      markUnsaved();
      if (currentButton) {
        const l = layers[currentLayer];
        const data = l.find((e) => e.id == currentButton);
        try {
          data.executables = JSON.parse(exeEditor.getValue());
        } catch { }
        markUnsaved();
      }
    });
  }
  initSidebar();

  async function initGridInterface() {
    // Position & size convert back from gridstack to database
    function gridHandler(event, el) {
      const node = el.gridstackNode; // {x, y, width, height, id, ....}
      const layer = layers[currentLayer];
      const data = layer.find((e) => e.id == node.id);
      data.gridArea[0] = `${node.y + 1}`;
      data.gridArea[1] = `${node.x + 1}`;
      data.gridArea[2] = `${node.y + node.h + 1}`;
      data.gridArea[3] = `${node.x + node.w + 1}`;
      markUnsaved();
    }
    grid.on("dragstop", gridHandler);
    grid.on("resizestop", gridHandler);

    // "Create new button" button
    const btnButtonCreate = document.querySelector("#btn_button_create");
    const inButtonCreate = document.querySelector("#in_button_create");
    btnButtonCreate.addEventListener("click", function () {
      const id = inButtonCreate.value;
      if (
        !id ||
        !id.match(/^[a-zA-Z-_0-9]+$/) ||
        layers[currentLayer].find((e) => e.id == id)
      )
        return;
      grid.addWidget({ content: "New Button", id });
      const el = grid.save(false).find((e) => e.id == id);
      const l = layers[currentLayer];
      l.push({
        id,
        gridArea: [],
        displayText: "New Button",
        type: "action",
        class: "gray",
        executables: [],
      });
      gridHandler(null, { gridstackNode: el });
      layer(currentLayer);
      editButton(id);
      inButtonCreate.value = "";
    });
  }
  initGridInterface();

  async function initErrorHandler() {
    const errToast = document.querySelector("#diag_error");
    function errorHandler(ev) {
      errToast.toast();
      document.querySelector("#diag_error_txt").textContent = `${ev?.error || ev?.reason || "Unknown error"
        }`;
    }
    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", errorHandler);
  }
  initErrorHandler();

  // Editor
  var isChanging = false;
  async function initEditor() {
    editor = ace.edit("ace");
    editor.on("input", function () {
      if (isChanging) return (isChanging = false);
      if (!currentFile) return;
      markUnsaved();
      if (currentFile === "config") {
        try {
          config = JSON.parse(editor.getValue());
          layers = config.layout.layers;
          columns = config.layout.gridColumns;
          rows = config.layout.gridRows;
        } catch { }
        layer(currentLayer);
      } else files[currentFile] = editor.getValue();
    });
    editor.setTheme("ace/theme/chaos");
    editor.session.setMode("ace/mode/css");
    fetch("./api/exe/css")
      .then((e) => e.text())
      .then((e) => {
        isChanging = true;
        editor.getSession().setValue(e);
        files.css = e;
        scanCss();
      })
      .catch(() => { });
    document
      .querySelector("sl-tab-group")
      .addEventListener("sl-tab-show", function (ev) {
        document.querySelector("#ace").hidden = ev?.detail?.name !== "script";
        document.querySelector(".grid-stack").hidden =
          ev?.detail?.name === "script";
        if (currentFile === "config" && ev?.detail?.name === "script") {
          isChanging = true;
          editor.getSession().setValue(JSON.stringify(config, null, 2));
        }
      });

    // Editor file handling
    scriptTree.addEventListener("sl-selection-change", function (ev) {
      if (ev.detail.selection.length === 0) return;
      const { id } = ev.detail.selection[0];
      if (id === "create") {
        ev.detail.selection[0].selected = false;
        let file = prompt("Name of the new executable?");
        if (!file) return;
        if (!file.match(/^[\w\-. ]+$/)) throw "Invalid executable name!";
        if (!file.endsWith(".js")) file += ".js";
        spinner();
        fetch(`./api/exe/${file}`, {
          method: "POST",
          body: JSON.stringify({ v: "" }),
        }).then((res) => {
          if (res.status !== 200) throw `Error creating "exe/${file}"`;
          createFile(file);
        }).finally(() => spinner(false));
        return;
      }
      if (id === "css") editor.session.setMode("ace/mode/css");
      else if (id === "config") editor.session.setMode("ace/mode/json");
      else editor.session.setMode("ace/mode/javascript");
      isChanging = true;
      if (id === "config") editor.getSession().setValue(JSON.stringify(config, null, 2));
      else {
        spinner();
        if(files[id]) {
          editor.getSession().setValue(files[id]);
          spinner(false);
        }
        else fetch("./api/exe/" + id)
          .then((e) => e.text())
          .then((e) => {
            editor.getSession().setValue(e);
          }).finally(() => spinner(false));
      }
      currentFile = id;
    });

    // This fetch is not important so it can be done after.
    fetch("./api/exe")
      .then((e) => e.json())
      .then((list) => {
        for (const file of list) createFile(file);
      });
    function createFile(file) {
      const item = document.createElement("sl-tree-item");
      item.innerText = file;
      const icon = document.createElement("sl-icon");
      icon.name = "filetype-js";
      item.prepend(icon);
      item.id = file;
      item.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        if (!confirm(`Do you want to delete "exe/${file}"`)) return;
        fetch(`./api/exe/${file}`, {
          method: "DELETE",
        }).then((res) => {
          if (res.status !== 200) throw `Error deleting "exe/${file}"`;
          item.remove();
        });
      });
      exeList.appendChild(item);
    }
  }

  function scanCss() {
    inButtonClass.childNodes.forEach((n) => n.className == "tmp" && n.remove());
    const list = `${files.css}`.matchAll(/^\.([a-zA-Z-._0-9]+) *\{ *$/gm);
    for (const [m, cl] of list) {
      const opt = document.createElement("sl-option");
      opt.innerHTML = `${cl}<sl-icon name="square" slot="prefix" class="${cl}">`;
      opt.value = cl;
      opt.className = "tmp";
      inButtonClass.appendChild(opt);
    }
    document.querySelector("#buttons-css").innerText = files.css;
  }

  window.editButton = function (id) {
    currentButton = null;
    const layer = layers[currentLayer];
    const data = layer.find((e) => e.id == id);
    inButtonId.value = data.id;
    inButtonText.value = data.displayText;
    inButtonClass.value = data.class.split(" ");
    inButtonType.value = data.type;
    if (data?.conditions?.add) {
      inCondActType.value = "add";
      inCondActName.value = data.conditions.add;
    } else if (data?.conditions?.remove) {
      inCondActType.value = "remove";
      inCondActName.value = data.conditions.remove;
    } else {
      inCondActType.value = "";
      inCondActName.value = "";
    }
    if (data?.conditions?.if) {
      inCondDepType.value = "if";
      inCondDepName.value = data.conditions.if;
    } else if (data?.conditions?.no) {
      inCondDepType.value = "no";
      inCondDepName.value = data.conditions.no;
    } else {
      inCondDepType.value = "";
      inCondDepName.value = "";
    }
    isExeChanging = true;
    exeEditor.getSession().setValue(JSON.stringify(data.executables, null, 2));
    currentButton = id;
  };
});

/**
 *
 * @param {Number} col
 * @param {Number} row
 */
function resize(col, row) {
  grid.column(col, "none");
  document.querySelector(".grid-stack").setAttribute("gs-min-row", row);
  document.querySelector(".grid-stack").setAttribute("gs-max-row", row);
  /**
   * @type {HTMLStyleElement}
   */
  const style = document.querySelector("style#grid-sizes");
  style.innerHTML = "";
  const sheet = [];
  const ratio = 100 / col;
  sheet.push(`
    .gs-${col} > .grid-stack-item {
      width: ${ratio}%;
    }
  `);
  for (let i = 0; i < col; i++) {
    sheet.push(`
      .gs-${col} .grid-stack-item[gs-x="${i}"] {
        left: ${i * ratio}%;
      }
    `);
    sheet.push(`
      .gs-${col} > .grid-stack-item[gs-w="${i}"] {
        width: ${ratio * i}%;
      }
    `);
  }
  style.innerHTML = sheet.join("\n");
  refreshCellHeight();
  document.querySelector(".statbar > #grid").textContent = `${col} x ${row}`;
}

function layer(num) {
  const ts = Date.now();
  resize(columns + 1, rows);
  grid.load(
    layers[num].map((e) => ({
      y: e.gridArea[0] - 1,
      x: e.gridArea[1] - 1,
      h: e.gridArea[2] - e.gridArea[0],
      w: e.gridArea[3] - e.gridArea[1],
      content: `
      <div onclick="editButton('${e.id}')" style="position: relative; height: 100%; display: flex; align-items: center; justify-content: center;" class="${e.class}">
        <div style="position: absolute; top: 5px; right: 5px; color: black; opacity: 0.3"><strong>ID:</strong> ${e.id}</div>
        <div style="text-align: center;"><strong>${e.displayText}</strong></div>
      </div>
    `,
      id: e.id,
    }))
  );
  resize(columns, rows);
  document.querySelector(".statbar > #layer").textContent = `Layer ${num}`;
  currentLayer = num;
  document.querySelector(".statbar #timing").textContent = `${Date.now() - ts
    }ms`;
}

function refreshCellHeight() {
  const height = parseInt(
    getComputedStyle(document.querySelector(".editor")).height.replace("px", "")
  );
  // 20 is the padding of the grid
  grid.cellHeight(height / rows);
}

function spinner(enable = true) {
  document.querySelector(".loader").style.display = enable
    ? null
    : "none";
}

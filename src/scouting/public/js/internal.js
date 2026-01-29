/*****************************************************************
                        !!!WARNING!!!
               EVERYTHING HERE IS VERY IMPORTANT
DO NOT REMOVE OR MODIFY ANYTHING UNLESS YOU KNOW WHAT YOU'RE DOING
*****************************************************************/
let config = fetch("/config/config.json").then((res) => res.json());
let matchScoutingConfig = fetch("/config/match-scouting.json").then((res) =>
  res.json()
);
let qrConfig = fetch("/config/qr.json").then((res) => res.json());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(
      function (registration) {
        // Registration was successful
        console.log(
          "ServiceWorker registration successful with scope: ",
          registration.scope
        );
      },
      function (err) {
        // registration failed
        console.log("ServiceWorker registration failed: ", err);
      }
    );
  });
}

let attemptedPWA;
window.addEventListener("beforeinstallprompt", (e) => {
  if (attemptedPWA) return;
  attemptedPWA = true;
  e.preventDefault();
  let prompt = e;
  let modal = new Modal("small");
  modal
    .text("SPOT is better when you install the app!")
    .action("Install", () => {
      prompt.prompt();
      prompt.userChoice.then(() => {
        modal.modalExit();
      });
    })
    .dismiss("Maybe Later");
});

function switchPage(pageName) {
  const pages = document.body.querySelectorAll(".page");
  for (const page of pages) {
    if (page.id == pageName) {
      showFade(page);
    } else {
      hideFade(page);
    }
  }
}

function deepClone(obj) {
  const cloned = Array.isArray(obj) ? [] : {};
  if (Array.isArray(obj)) {
    for (const prop of obj) {
      if (typeof prop !== "object" || !prop) {
        cloned.push(prop);
      } else {
        cloned.push(deepClone(prop));
      }
    }
  } else {
    for (const prop in obj) {
      if (typeof obj[prop] !== "object" || !obj[prop]) {
        cloned[prop] = obj[prop];
      } else {
        cloned[prop] = deepClone(obj[prop]);
      }
    }
  }
  return cloned;
}

class Modal {
  blind; // dimmed background element (closes modal on click)
  close; // close button element
  element; // main modal container element
  modalExit; // function to close and destroy the modal
  dismissButton; // optional dismiss button element
  cancel; // cancel function passed in

  constructor(size) {
    this.blind = document.createElement("div");
    this.blind.classList = "modal-blind";
    this.element = document.createElement("div");
    this.element.classList = `modal ${size}`;
    this.close = document.createElement("i");
    this.close.classList = "fa fa-times modal-close";
    this.modalExit = () => {
      hideFade(this.blind);
      hideFade(this.element);
      setTimeout(() => {
        document.body.removeChild(this.blind);
        document.body.removeChild(this.element);
      }, 300);
    };
    this.blind.addEventListener("click", this.modalExit);
    this.close.addEventListener("click", this.modalExit);
    this.element.appendChild(this.close);
    document.body.appendChild(this.blind);
    document.body.appendChild(this.element);
    this.blind.offsetHeight;
    this.element.offsetHeight;
    showFade(this.blind);
    showFade(this.element);
    return this;
  }

  assignCancel(cancelFunction) {
    this.blind.addEventListener("click", cancelFunction);
    this.close.addEventListener("click", cancelFunction);
    this.dismissButton
      ? this.dismissButton.addEventListener("click", cancelFunction)
      : null;
    this.cancel = cancelFunction;
  }

  header(text) {
    const headerElement = document.createElement("div");
    headerElement.innerHTML = text;
    headerElement.classList.add("header");
    this.element.appendChild(headerElement);
    return this;
  }

  text(text) {
    const textElement = document.createElement("div");
    textElement.innerHTML = text;
    textElement.classList.add("text");
    this.element.appendChild(textElement);
    return this;
  }

  image(src) {
    const imgElement = document.createElement("img");
    imgElement.src = src;
    this.element.appendChild(imgElement);
    return this;
  }

  center(horizontal = true, vertical = false) {
    if (vertical) {
      this.element.classList.add("main-center");
    }

    if (horizontal) {
      this.element.classList.add("alt-center");
    }

    return this;
  }

  dismiss(buttonText = "Dismiss") {
    const buttonElement = document.createElement("button");
    buttonElement.innerText = buttonText;
    buttonElement.addEventListener("click", this.modalExit);
    this.cancel ? buttonElement.addEventListener("click", this.cancel) : null;
    this.element.appendChild(buttonElement);

    return this;
  }

  action(buttonText, func) {
    const buttonElement = document.createElement("button");
    buttonElement.innerText = buttonText;
    buttonElement.addEventListener("click", func);
    this.element.appendChild(buttonElement);
    return this;
  }
}

function showFade(element) {
  element.classList.add("visible");
}

function hideFade(element) {
  element.classList.remove("visible");
}

class Popup {
  static types = {
    error: {
      prefix: "Error: ",
      color: "var(--error)",
    },

    notice: {
      prefix: "",
      color: "var(--accent)",
    },

    success: {
      prefix: "",
      color: "var(--green)",
    },
  };
  popupElement;

  constructor(type, text, duration = 5000) {
    this.popupElement = document.createElement("p");
    this.popupElement.classList = "popup";
    this.popupElement.style.backgroundColor = Popup.types[type].color;
    this.popupElement.innerText = Popup.types[type].prefix + text;
    document.body.appendChild(this.popupElement);
    this.popupElement.offsetHeight;
    this.popupElement.style.top = "55px";
    setTimeout(() => {
      this.popupElement.style.top = "0";
      setTimeout(() => {
        document.body.removeChild(this.popupElement);
      }, 600);
    }, duration);
  }
  setText(text) {
    this.popupElement.innerText = text;
    return this;
  }
  setType(type) {
    this.popupElement.style.backgroundColor = Popup.types[type].color;
    return this;
  }
}

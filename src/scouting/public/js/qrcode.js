class QREncoder {
  initialized;
  ACTION_SCHEMA;
  ID_ENUM;
  ID_ENUM_REVERSE;

  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    qrConfig = await qrConfig;

    this.ACTION_SCHEMA = qrConfig.ACTION_SCHEMA;
    const scoutingConfig = await matchScoutingConfig;

    // Attempt to include action IDs from both common scouting configs so QR encoding
    // will work even if TMPs contain actions from either layout
    const buttonLists = [];
    try {
      buttonLists.push(scoutingConfig.layout.layers.flat());
    } catch (e) {
      // ignore
    }

    try {
      const alt = await fetch("/config/match-scouting-5x12.json").then((r) =>
        r.json(),
      );
      if (alt && alt.layout && Array.isArray(alt.layout.layers)) {
        buttonLists.push(alt.layout.layers.flat());
      }
    } catch (e) {
      // file may not exist; ignore
    }

    // merge and de-duplicate
    const merged = Array.from(
      new Map(buttonLists.flat().map((b) => [b.id, b])).values(),
    );

    this.ID_ENUM = QREncoder.generateIdEnum(merged);
    this.ID_ENUM_REVERSE = Object.assign(
      {},
      ...Object.entries(this.ID_ENUM).map(([key, index]) => ({ [index]: key })),
    );

    console.log(
      `QREncoder: using ${Object.keys(this.ID_ENUM).length} action ids for QR encoding`,
    );

    this.initialized = true;
  }

  static generateIdEnum(buttons) {
    let ids = [];

    for (let button of buttons) {
      if (!ids.includes(button.id)) ids.push(button.id);
    }

    let idEnum = {};
    for (let [index, id] of ids.entries()) {
      idEnum[id] = index;
    }
    return idEnum;
  }

  static encodeValue(val, max, min, bits) {
    if (val === undefined || val === null) {
      throw new Error(
        `Cannot encode undefined or null value (max=${max} min=${min} bits=${bits})`,
      );
    }
    const n = Number(val);
    if (Number.isNaN(n)) {
      throw new Error(
        `Cannot encode non-numeric value '${val}' (max=${max} min=${min} bits=${bits})`,
      );
    }
    if (n > max || n < min) {
      throw new Error(
        `value ${n} is outside of provided max (${max}) and min (${min})`,
      );
    }
    return n.toString(2).padStart(bits, "0");
  }

  /**
   *
   * @returns should pop up a qr code that can be scanned by the decoder
   * all the data is stored in local data
   * button that pops up a new tab with a list of matches scored (should be on starting page)
   * clicking on the match pops up qr code
   */
  async encodeTeamMatchPerformance(teamMatchPerformance) {
    console.log(teamMatchPerformance);

    await this.init();

    if (!teamMatchPerformance || typeof teamMatchPerformance !== "object") {
      throw new Error("Invalid teamMatchPerformance provided to encoder");
    }

    let out = ""; //store everything in strings. This is inefficient, but I haven't found a better way to do this in browser js and it probably doesn't matter.

    /****** Match Info (200 bits) ******/
    const clientVersion = teamMatchPerformance.clientVersion || "0.0";
    let [majorVersion, minorVersion] = clientVersion
      .split(".")
      .map((x) => parseInt(x) || 0);

    out += QREncoder.encodeValue(majorVersion, 255, 0, 8); // major version (8 bits)
    out += QREncoder.encodeValue(minorVersion, 255, 0, 8); // minor version (8 bits)

    const eventNumberStr = String(teamMatchPerformance.eventNumber || "0");
    const eventNumberParts = eventNumberStr.match(/.{1,8}/g) || ["0"]; //split the event number into 8 digit parts
    for (const eventNumberPart of eventNumberParts) {
      out += QREncoder.encodeValue(
        parseInt(eventNumberPart, 16) || 0,
        2 ** 32 - 1,
        0,
        32,
      ); //event number part (32 bits)
    }

    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.matchNumber) || 0,
      255,
      0,
      8,
    ); // match number (8 bits)

    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.robotNumber) || 0,
      65535,
      0,
      16,
    ); // team number (16 bits)

    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.matchId_rand) || 0,
      2 ** 64 - 1,
      0,
      64,
    ); // matchId_rand (64 bits)

    // console.log(this.ID_ENUM);
    /****** Action Queue ******/
    const actionQueue = Array.isArray(teamMatchPerformance.actionQueue)
      ? teamMatchPerformance.actionQueue
      : [];

    for (let action of actionQueue) {
      //action's values are defined by the ACTION_SCHEMA in qr.json
      for (let { key, bits } of this.ACTION_SCHEMA) {
        if (key == "id") {
          const idVal = getVal(action, key);
          if (idVal === undefined) {
            throw new Error(
              `Missing action id for action ${JSON.stringify(action)}`,
            );
          }
          let mapped = this.ID_ENUM[idVal];
          if (mapped === undefined) {
            // If an action id came from a different layout, it may not be in the current ID_ENUM.
            // Fall back gracefully to avoid crashing QR generation and encode as 0 (reserved).
            console.warn(
              `Unknown action id '${idVal}' not found in ID_ENUM - encoding as 0`,
            );
            mapped = 0;
          }
          out += QREncoder.encodeValue(mapped, 2 ** bits - 2, 0, bits); //254 max unique ids, probably enough for 99.9% of scouting apps
        } else {
          const raw = getVal(action, key);
          const num = parseInt(raw);
          if (isNaN(num)) {
            throw new Error(
              `Non-numeric action value for key '${key}' in action ${JSON.stringify(action)}`,
            );
          }
          out += QREncoder.encodeValue(num, 2 ** bits - 1, 0, bits);
        }
        //encode the value parseInt'd to allow for strings that contain an integer number. max is 2^bits - 2 for id and 2^bits - 1 for all other numbers as an action of 2^(total bits)-1 indicates the end of the action queue
      }
    }

    out += "11111111"; //filled byte to signify the end of the action queue

    // console.log(
    //   "hex bytes",
    //   out.match(/.{1,8}/g).map((x) => parseInt(x, 2).toString(16))
    // );

    const data = new Uint8ClampedArray(
      out.match(/.{1,8}/g).map((x) => parseInt(x, 2)),
    );

    const dataB64 = btoa(String.fromCharCode.apply(null, data));

    let dataUrl;
    await QRCode.toDataURL(
      dataB64,
      {
        errorCorrectionLevel: "M",
      },
      (err, url) => {
        if (err) {
          console.log(err);
        }

        dataUrl = url;
      },
    );

    return dataUrl;
  }
}

function getVal(obj, path) {
  if (path === "") return obj;
  path = path.split(".");
  return getVal(obj[path.shift()], path.join("."));
}

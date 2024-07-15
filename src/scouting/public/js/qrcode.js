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
    this.ID_ENUM = QREncoder.generateIdEnum(
      scoutingConfig.layout.layers.flat()
    );
    this.ID_ENUM_REVERSE = Object.assign(
      {},
      ...Object.entries(this.ID_ENUM).map(([key, index]) => ({ [index]: key }))
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
    if (val > max || val < min)
      throw new Error("value is outside of provided max and min");
    return val.toString(2).padStart(bits, "0");
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

    let out = ""; //store everything in strings. This is inefficient, but I haven't found a better way to do this in browser js and it probably doesnt matter.

    /****** Match Info (80 bits) ******/
    let [majorVersion, minorVersion] = teamMatchPerformance.clientVersion
      .split(".")
      .map((x) => parseInt(x));

    console.log("1");
    out += QREncoder.encodeValue(majorVersion, 255, 0, 8); // major version (8 bits)
    console.log("2");
    out += QREncoder.encodeValue(minorVersion, 255, 0, 8); // minor version (8 bits)
    console.log("3");
    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.eventNumber),
      255,
      0,
      8
    ); //event number (8 bits)
    console.log("4");
    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.matchNumber),
      255,
      0,
      8
    ); // match number (8 bits)
    console.log("5");
    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.robotNumber),
      65535,
      0,
      16
    ); // team number (16 bits)
    console.log("6");
    out += QREncoder.encodeValue(
      parseInt(teamMatchPerformance.matchId_rand, "32"),
      2 ** 64 - 1,
      0,
      64
    ); // matchId_rand (64 bits)

    console.log("7");
    console.log(this.ID_ENUM);
    /****** Action Queue ******/
    for (let action of teamMatchPerformance.actionQueue) {
      //action's values are defined by the ACTION_SCHEMA in qr.json
      for (let { key, bits } of this.ACTION_SCHEMA) {
        if (key == "id") {
          console.log("ID:");
          console.log(this.ID_ENUM[getVal(action, key)]);
          out += QREncoder.encodeValue(
            this.ID_ENUM[getVal(action, key)],
            2 ** bits - 2,
            0,
            bits
          ); //254 max unique ids, probably enough for 99.9% of scouting apps
        } else {
          console.log("ts:");
          console.log(parseInt(getVal(action, key)));
          out += QREncoder.encodeValue(
            parseInt(getVal(action, key)),
            2 ** bits - 1,
            0,
            bits
          );
        }
        //encode the value parseInt'd to allow for strings that contain an integer number. max is 2^bits - 2 for id and 2^bits - 1 for all other numbers as an action of 2^(total bits)-1 indicates the end of the action queue
      }
    }

    out += "11111111"; //filled byte to signify the end of the action queue

    // console.log("hex bytes", out.match(/.{1,8}/g).map(x=>parseInt(x,2).toString(16)));

    const data = new Uint8ClampedArray(
      out.match(/.{1,8}/g).map((x) => parseInt(x, 2))
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
      }
    );

    return dataUrl;
  }
}

function getVal(obj, path) {
  if (path === "") return obj;
  path = path.split(".");
  return getVal(obj[path.shift()], path.join("."));
}

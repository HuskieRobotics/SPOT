require("./analysis");

async function got() {
  let api = await global.apiStuff();
  console.log("Api : " + api);
  return api;
}

module.exports = { got };

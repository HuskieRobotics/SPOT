require("./analysis");

async function got() {
  let api = await global.processTransformers();
  console.log("Api : " + api);
  return api;
}

module.exports = { got };

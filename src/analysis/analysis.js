const express = require("express");
const path = require("path");
const fs = require("fs");
let router = express.Router();
const { setPath } = require("../lib/util");
const ss = require("simple-statistics");
router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs");
});

let modulesOutput;
router.get("/modules.js", (req, res) => {
  if (modulesOutput) {
    res.send(modulesOutput); //there might be a better way to do this
  } else {
    let output = `/* autogenerated output of all modules in the /analysis/modules folder */`;
    const moduleList = fs.readdirSync(__dirname + "/modules");
    for (let module of moduleList) {
      const moduleFile = fs.readFileSync(
        `${__dirname}/modules/${module}/index.js`
      );
      output += `\n\n//${module}\n`;
      output += moduleFile;
    }

    output += `\n\n//mapping\nconst moduleClasses = {`;
    output += moduleList.join(",\n");
    output += "}";

    // modulesOutput = output;
    res.send(output);
  }
});

router.get("/transformers.js", async (req, res) => {
  // Get the analysis transformer, containing important information about
  // how to build the client-side transformers conjugate file
  const analysisTransformer = require("../../config/analysis-transformers.json");

  // Set the output to the template file
  let output = fs
    .readFileSync(
      `${__dirname}/transformers/${analysisTransformer.template
        .file}`
    )
    .toString();

  // Set each transformer's data to "name: {", leaving the object open to add
  // transformers to it
  for (const transformerType of analysisTransformer.types) {
    transformerType.data = `${transformerType.name}: {\n`;
  }

  for (const file of fs.readdirSync(path.resolve(__dirname, "transformers"))) {
    // Make sure the file isn't a file that should be ignored
    if (analysisTransformer.ignore.includes(file)) {
      continue;
    }

    // Get the contents of the JS file
    const contents = fs
      .readFileSync(`${__dirname}/transformers/${file}`)
      .toString();

    // Check the file for each type of transformer (i.e. tmp, team, etc.)
    for (const transformerType of analysisTransformer.types) {
      const pattern = new RegExp(
        `__${transformerType.identifier}__\\s*([\\s\\S]*?)\\s*__/${transformerType.identifier}__`,
        "i"
      );
      const match = pattern.exec(contents);

      // If it contains that type of transformer, add it to the list
      if (match) {
        // Add "identifier: new DataTransformer(...)" tp the transformer type's data,
        // plus a comma to allow for the next data transformer
        transformerType.data += `${file.split(".")[0]}: ${match[1].trim()},\n`;

        // Would look something like:
        /*
                    name: {
                        identifier: new DataTransformer(...),
                        identifier2: new DataTransformer(...),
                        etc.
                */
      }
    }
  }

  // Add all of the files together to build the conjugate
  let conjugate = "";
  for (const transformerType of analysisTransformer.types) {
    // Add individual data to conjugate and add a } to the end to complete
    // the object's declaration, as well as a comma
    conjugate += `\n${transformerType.data}},`;
  }

  // Ends up looking like:
  /*
        tmp: {
            actionTime: new DataTransformer(...),
        },
        team: {
            aggregateArray: new DataTransformer(...),
        }
        etc.
    */

  // Replace the placeholder with the conjugate to finish the output
  output = output.replace(analysisTransformer.template.placeholder, conjugate);
  //temp = output;
  // Send the output to the client
  res.send(output);
});

async function apiStuff() {
  // Get the analysis transformer, containing important information about
  // how to build the client-side transformers conjugate file
  const analysisTransformer2 = require("../../config/analysis-transformers.json");

  // Set the output to the template file
  let output2 = fs
    .readFileSync(
      `${__dirname}/transformers/${analysisTransformer2.template2.file}`
    )
    .toString();

  // Set each transformer's data to "name: {", leaving the object open to add
  // transformers to it
  for (const transformerType2 of analysisTransformer2.types) {
    transformerType2.data = `${transformerType2.name}: {\n`;
  }

  for (const file2 of fs.readdirSync(path.resolve(__dirname, "transformers"))) {
    // Make sure the file isn't a file that should be ignored
    if (analysisTransformer2.ignore.includes(file2)) {
      continue;
    }

    // Get the contents of the JS file
    const contents2 = fs
      .readFileSync(`${__dirname}/transformers/${file2}`)
      .toString();

    // Check the file for each type of transformer (i.e. tmp, team, etc.)
    for (const transformerType2 of analysisTransformer2.types) {
      const pattern2 = new RegExp(
        `__${transformerType2.identifier}__\\s*([\\s\\S]*?)\\s*__/${transformerType2.identifier}__`,
        "i"
      );
      const match2 = pattern2.exec(contents2);

      // If it contains that type of transformer, add it to the list
      if (match2) {
        // Add "identifier: new DataTransformer(...)" tp the transformer type's data,
        // plus a comma to allow for the next data transformer
        transformerType2.data += `${file2.split(".")[0]}: ${match2[1].trim()},\n`;

        // Would look something like:
        /*
                    name: {
                        identifier: new DataTransformer(...),
                        identifier2: new DataTransformer(...),
                        etc.
                */
      }
    }
  }

  // Add all of the files together to build the conjugate
  let conjugate2 = "";
  for (const transformerType2 of analysisTransformer2.types) {
    // Add individual data to conjugate and add a } to the end to complete
    // the object's declaration, as well as a comma
    conjugate2 += `\n${transformerType2.data}},`;
  }

  // Ends up looking like:
  /*
        tmp: {
            actionTime: new DataTransformer(...),
        },
        team: {
            aggregateArray: new DataTransformer(...),
        }
        etc.
    */

  // Replace the placeholder with the conjugate to finish the output
  output2 = output2.replace(analysisTransformer2.template2.placeholder, conjugate2);
  //console.log("Output : " + output);
  let temp = output2;
  const tempFilePath2 = path.join(__dirname, "transformers.js");

  fs.writeFileSync(tempFilePath2, temp);

  const module2 = require(tempFilePath2);

  fs.unlinkSync(tempFilePath2);
  return module2;
}

global.apiStuff = apiStuff;

let modulesStyleOutput;
router.get("/modules.css", (req, res) => {
  if (modulesStyleOutput) {
    res.send(modulesStyleOutput); //there might be a better way to do this
  } else {
    let output = "";
    for (let module of fs.readdirSync(__dirname + "/modules")) {
      if (module !== "index.js") {
        const moduleFile = fs.readFileSync(
          `${__dirname}/modules/${module}/style.css`
        );
        output += moduleFile;
      }
    }
    // modulesStyleOutput = output;
    res.type("text/css");
    res.send(output);
  }
});

router.use("/api", require("./routes/api.js"));

module.exports = router;

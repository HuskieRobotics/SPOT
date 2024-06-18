# Transformers With the Client-Side Analysis Pipeline

To make full use of the client-side pipeline, all new transformers should be strictly designed to run on a client, not the server, even though they are stored on the server. When a client is referencing `./transformers.js`, they are actually referencing a compiled file of all the transformers together in one script, similar to how `./modules.js` works. A template file works as the base for this compiled file. Creating the compiled file is done by traversing each transformer, extracting each specific transformer type, and once that is finished replacing the placeholder in the template file with all the most important information. An example template file is:

```js
async function getTransformers() {
  const matchScoutingConfig = await fetch(
    "../../../config/match-scouting.json"
  ).then((res) => res.json());
  const actionIds = matchScoutingConfig.layout.layers
    .flat()
    .reduce(
      (acc, button) => (acc.includes(button.id) ? acc : acc.concat(button.id)),
      []
    );

  return {
    __TRANSFORMERS__,
  };
}
```

where \_\_TRANSFORMERS\_\_ is the placeholder (the specific file path and placeholder name can be found in `'/config/analysis-transformers.json'`).

### Analysis Transformers Config

The analysis transformers config file is what outlines the specific details of how the offline analysis pipeline works, found at `/config/analysis-transformers.json`. The following is an example analysis transformers config file:

```json
{
  "template": {
    "file": "_template.template.js",
    "placeholder": "__TRANSFORMERS__"
  },
  "types": [
    {
      "name": "tmp",
      "identifier": "TMP",
      "data": ""
    },
    {
      "name": "team",
      "identifier": "TEAM",
      "data": ""
    }
  ],
  "ignore": ["_template.template.js", "transformers.md"]
}
```

- `template`: Outlines important information about the template file that will be used to generate the the compiled file sent to the client
  - `file`: The template file to inject the compiled transformers into
  - `placeholder`: Placeholder text to look for, that is then replaced with all of the transformers
- `types`: An array containing all of the transformer types to look for (i.e. `tmp`, `team`, etc.)
  - `name`: The name of the type, which will be the key in the transformer object returned by the function created by the template file (i.e. `getTransformers()[name]` returns an array of the transformers associated with that name)
  - `identifier`: The tag to look for in each transformer file, creating an association between the identifier and the name (i.e. `__IDENTIFIER__` and `__/IDENTIFIER__`) (This should (hopefully) later be changed to use file directories instead of relying on text in the file)
  - `data`: This value should be left as an empty string. At runtime it will contain all of the transformers for that type
- `ignore`: An array of any files to ignore when searching for transformers

## Creating a New Transformer

Creating a new transformer is a relatively simple process, but requires you to follow some key steps. Firstly, make sure to document new transformers thoroughly. All new transformers should follow this format:

```js
/**
 * @type {DataTransformer}
 * @param options.abc {type} explanation of what options.abc is
 * @param options.xyz {type} explanation of what options.xyz is
 * etc.
 */
__IDENTIFIER__;
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
  // ... Transformer code here ...
});
__ / IDENTIFIER__;
```

The most important things to note here are:

- `TRANSFORMER_NAME`: should be the same as the file name for ease of use (and differences between the two could cause things to break)
- `IDENTIFIER`: This is how the server identifies what kind of transformer it is (i.e. one for a tmp, a team, etc.). All valid identifiers can be found in `'/config/analysis-transformers.json'` under `"types"`. If need be, add any new identifiers to the JSON file. Only code within the tag (opened with `__IDENTIFIER__` and closed with `__/IDENTIFIER__` similarly to HTML) will be included in the compiled file. This should pretty much only be the new DataTransformer object, as other code may break the compiled file by causing syntax errors in the array of transformers

Transformer files can also have multiple transformers, but they must be of **different** types due to current implementation limitations.
Example 1:

```js
// This IS valid and will work as expected :)

__TMP__;
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
  // ... Transformer code here ...
});
__ / TMP__;

__TEAM__;
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
  // ... Transformer code here ...
});
__ / TEAM__;
```

Example 2:

```js
// This is NOT valid and may not work as intended :(

__TEAM__;
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
  // ... Transformer code here ...
});
__ / TEAM__;

__TEAM__;
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
  // ... Transformer code here ...
});
__ / TEAM__;
```

Another important detail to note is that, if you need to define a variable **outside** of the DataTransformer object (or really execute **any** code outside of the DataTransformer), it should be put in the template file and **not** the transformer file, as this could cause issues when the compiled file is created. Additionally, make sure code added to the template file is client friendly, and **DO NOT PUT A SEMI-COLON AT THE END OF THE DATA TRANSFORMER**, as this will cause the compiled file to break

## compiled File

The compiled file contains all of the transformers compiled and filled in the place of the placeholder in the template file.
If the template file looks like the following:

```js
async function getTransformers() {
  const matchScoutingConfig = await fetch(
    "../../../config/match-scouting.json"
  ).then((res) => res.json());
  const actionIds = matchScoutingConfig.layout.layers
    .flat()
    .reduce(
      (acc, button) => (acc.includes(button.id) ? acc : acc.concat(button.id)),
      []
    );

  return {
    __TRANSFORMERS__,
  };
}
```

Then the compiled file may look something like:

```js
async function getTransformers() {
  const matchScoutingConfig = await fetch(
    "../../../config/match-scouting.json"
  ).then((res) => res.json());
  const actionIds = matchScoutingConfig.layout.layers
    .flat()
    .reduce(
      (acc, button) => (acc.includes(button.id) ? acc : acc.concat(button.id)),
      []
    );

  return {
    typeNameA: {
      transformerA: new DataTransformer(
        "transformerA",
        (dataset, outputPath, options) => {
          // ... transformer code here ...
        }
      ),
    },
    typeNameB: {
      transformerB: new DataTransformer(
        "TransformerB",
        (dataset, outputPath, options) => {
          // ... transformer code here ...
        }
      ),
    },
  };
}
```

For documentation/comments on the specific code implementation of this, check the `/transformers.js` get request in `/analysis.js`

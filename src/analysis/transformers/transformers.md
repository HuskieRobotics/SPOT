# Transformers With the Client-Side Pipeline
To make full use of the client-side pipeline, all new transformers should be strictly designed to run on a client, not the server, even though they are stored on the server. When a client is referencing `./transformers.js`, they are actually referencing a conjugate file of all the transformers together in one script, similar to how modules works. A template file works as the base for this conjugate file. Creating the conjugate file is done by traversing each transformer, extracting each specific transformer type, and once that is finished replacing the placeholder in the template file with all the most important information. An example template file is:
```js
async function getTransformers() {
    const matchScoutingConfig = await fetch("../../../config/match-scouting.json").then(res => res.json());
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []);

    return {
        __TRANSFORMERS__
    };
}
```
where \_\_TRANSFORMERS__ is the placeholder (the specific file path and placeholder name can be found in `'/config/analysis-transformers.json'`).

## Creating a New Transformer
Creating a new transformer is a relatively simple process, but requires you to follow some key steps. Firstly, make sure to document new transformers thoroughly. All new transformers should follow this format:
```js
/* <IDENTIFIER> */
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
    // ... Transformer code here ...
})
/* </IDENTIFIER> */
```
The most important things to note here are:
- `TRANSFORMER_NAME`: should be the same as the file name for ease of use (and differences between the two could cause things to break)
- `IDENTIFIER`: This is how the server identifies what kind of transformer it is (i.e. one for a tmp, a team, etc.). All valid identifiers can be found in `'/config/analysis-transformers.json'` under `"types"`. If need be, add any new identifiers to the JSON file. Only code within the tag (opened with `/* <IDENTIFIER> */` and closed with `/* </IDENTIFIER> */` similarly to HTML) will be included in the conjugate file. This can pretty much only be the new DataTransformer object, as other code may break the conjugate file

Transformer files can also have multiple transformers, but they must be of __different__ types.
Example 1:
```js
// This is valid and will work as expected :)

/* <TMP> */
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
    // ... Transformer code here ...
})
/* </TMP> */

/* <TEAM> */
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
    // ... Transformer code here ...
})
/* </TEAM> */
```
Example 2:
```js
// This is NOT valid and may not work as intended :(

/* <TEAM> */
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
    // ... Transformer code here ...
})
/* </TEAM> */

/* <TEAM> */
new DataTransformer("TRANSFORMER_NAME", (dataset, outputPath, options) => {
    // ... Transformer code here ...
})
/* </TEAM> */
```

Another important detail to note is that, if you need to define a variable __outside__ of the DataTransformer object (or really execute __any__ code outside of the DataTransformer), it should be put in the template file and __not__ the transformer file, as this could cause issues when the conjugate file is created. Additionally, make sure code added to the template file is client-side friendly, and __DO NOT PUT A SEMI-COLON AT THE END OF THE DATA TRANSFORMER CREATION EXPRESSION__, this will cause the conjugate file to break 

## Conjugate File
The conjugate file contains all of the transformers compiled and filled in the place of the placeholder in the template file.
If the template file looks like the following:
```js
async function getTransformers() {
    const matchScoutingConfig = await fetch("../../../config/match-scouting.json").then(res => res.json());
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []);

    return {
        __TRANSFORMERS__
    };
}
```
Then the conjugate file may look something like:
```js
async function getTransformers() {
    const matchScoutingConfig = await fetch("../../../config/match-scouting.json").then(res => res.json());
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []);

    return {
        identifierA: {
            transformerA: new DataTransformer("transformerA", (dataset, outputPath, options) => {
                // ... transformer code here ...
            })
        },
        identifierB: {
            transformerB: new DataTransformer("TransformerB", (dataset, outputPath, options) => {
                // ... transformer code here ...
            })
        }
    };
}
```
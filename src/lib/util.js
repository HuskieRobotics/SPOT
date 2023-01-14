class ThrowError {
} //this is probably not best practice, I tried to find a better way but no luck
/**
 * return the value at a keypath in a object
 * @param {Object} obj - the object
 * @param {String} path - the path within the object "data.matches.q24.teams"
 * @param {*} ifnone - returned if the path does not exist in the object. If this isn't defined getPath will throw an error if the path doesnt exist.
 * @returns
 */
function getPath(obj,path,ifnone=ThrowError) {
    if (typeof obj === "undefined") {  
        if (ifnone == ThrowError)  {
            throw new Error(`path ${path} not traversable!`);
        } else {  
            return ifnone;
        }
    }
    if (path === "") return obj;
    path = path.split(".");
    return getPath(obj[path.shift()], path.join("."), ifnone);
}

/**
 * set a value at a keypath within an object
 * @param {Object} obj the object that will be modified
 * @param {String} path the keypath where you wish to set the value (eg. "team.counts.lowerHub"). If this is not fully defined, it will be created
 * @param {Object} value the value to set at the path
 * @returns the value
 */

function setPath(obj, path, value) {
    if (!path.includes(".")) return obj[path] = value;
    path = path.split(".");
    if (!obj[path[0]]) obj[path[0]] = {}; // if the path doesn't exist, make an empty object there
    return setPath(obj[path.shift()], path.join("."), value);
}


// /**
//  * Get a path list from an object, a path string (eg. "match.robots.team3061"), and a path list of already processed parts of the path
//  * @param {Object} obj the object 
//  * @param {String} pathString the path string
//  * @param {String[]} pathList a partially built pathList (used recursively)
//  * @returns {String[]} the final path list
//  */
//  function getPathList(objList,pathString,pathList=[]) {
//     let keyList = pathString.split("."); //split pathString into keys
//     let next = keyList.shift();

//     if (pathList.length == 0) { //the first key of the path
//         return getPathList(objList, keyList.join("."), [next]);
//     } else if (next == "*") { //wildcard paths
//         let foundPaths = new Set();
//         for (let obj of objList) {
//             for (let path of pathList) {
//                 Object.keys(getPath(obj,path)).forEach(x=>foundPaths.add(path+x));
//             }
//         }
//         getPathList(objList,keyList.join("."),foundPaths);
//     } else { //normal path (eg. "robots")
//         for (let [index,path] of pathList.entries()) {
//             pathList[index] = `${path}.${next}`; //concatenate the next part of the path onto the existing paths in pathlist
//         }
//         getPathList(objList,keyList.join("."),pathList);
//     }
// }

module.exports = {getPath, setPath};
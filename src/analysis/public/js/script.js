function makeReadOnly(obj) {
    let out = {};
    if (typeof obj != "object") {
        return obj;
    } else {
        for (let [key, value] of Object.entries(obj)) {
            if (value != undefined && value != null) Object.defineProperty(out, key, {
                value: makeReadOnly(value),
                writable: false
            })
        }
        return out;
    }
}
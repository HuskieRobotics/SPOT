/*****************************************************************
                        !!!WARNING!!!
               EVERYTHING HERE IS VERY IMPORTANT
DO NOT REMOVE OR MODIFY ANYTHING UNLESS YOU KNOW WHAT YOU'RE DOING
*****************************************************************/
let config = fetch(`/config.json`).then(res => res.json());

function switchPage(pageName) {
    const pages = document.body.querySelectorAll(".page")
    for (const page of pages) {
        if (page.id == pageName) {
            page.classList.add("visible")
        } else {
            page.classList.remove("visible")
        }
    }
}

function deepClone(obj) {
  const cloned = Array.isArray(obj) ? [] : {};
  if (Array.isArray(obj)) {
    for (const prop of obj) {
      if (typeof prop !== 'object' || !prop) {
        cloned.push(prop)
      } else {
        cloned.push(deepClone(prop))
      }
    }
  } else {
    for (const prop in obj) {
      if (typeof obj[prop] !== 'object' || !obj[prop]) {
        cloned[prop] = obj[prop]
      } else {
        cloned[prop] = deepClone(obj[prop])
      }
    }
  }
  return cloned;
}
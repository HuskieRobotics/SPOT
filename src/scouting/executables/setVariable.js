executables["setVariable"] = {
    execute(button, layers,name, value) {
        if(!variables[name]){
          variables[name] = {
            "current":value,
            "previous":[]
          }
        } else {
          variables[name].previous.push(variables[name].current);
          variables[name].current = value;
        }
        console.log(variables)
    },
    reverse(button, layers,name, value) {
      console.log(`reversing ${name}`)
      variables[name].current = variables[name].previous.pop()
    }
}
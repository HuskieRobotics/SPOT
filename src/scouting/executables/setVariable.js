executables["setVariable"] = {
  execute(button, layers, name, value) {
    console.log("SET VARIABLE --------------------------------------");
    if (!variables[name]) {
      variables[name] = {
        current: value,
        previous: [],
      };
    } else {
      variables[name].previous.push(variables[name].current);
      variables[name].current = value;
    }
    console.log(variables);
  },
  reverse(button, layers, name, value) {
    variables[name].current = variables[name].previous.pop();
    console.log(`reversing ${name} to ${variables[name].current}`);
  },
};

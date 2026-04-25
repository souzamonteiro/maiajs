const expressionFunc = function(param) {
  return 'Function expression: ' + param;
};

const Animal = function(name, species) {
  this.name = name;
  this.species = species;
};

const trailingCommas = function(a, b, c) {
  return a + ', ' + b + ', ' + c;
};

console.log(expressionFunc('World'));
const genericAnimal = new Animal('Generic', 'Unknown');
console.log(trailingCommas('a', 'b', 'c'));
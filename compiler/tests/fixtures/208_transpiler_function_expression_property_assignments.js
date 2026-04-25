const Animal = function(name, species) {
  this.name = name;
  this.species = species;
};

Animal.prototype.speak = function() {
  return this.name + ' makes a sound';
};

Animal.classify = function() {
  return 'All animals are living organisms';
};

const Dog = function(name, breed) {
  Animal.call(this, name, 'Canine');
  this.breed = breed;
};

Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.speak = function() {
  return this.name + ' barks';
};
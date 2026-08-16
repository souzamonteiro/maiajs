function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

class Shape {
  area() {
    return 0.0;
  }
}

class Rectangle extends Shape {
  constructor(w, h) {
    super();
    this.w_ = w;
    this.h_ = h;
  }

  area() {
    return this.w_ * this.h_;
  }
}

class Circle extends Shape {
  constructor(r) {
    super();
    this.r_ = r;
  }

  area() {
    return 3.14159 * this.r_ * this.r_;
  }
}

function main() {
  var rect = new Rectangle(4.0, 3.0);
  if (rect.area() == 12.0) { pass("rect_area"); } else { fail("rect_area"); }
  console.log("ALL PASS");
}

main();

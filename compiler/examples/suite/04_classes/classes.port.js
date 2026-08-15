function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
  }

  isOnXAxis() {
    return this.y == 0;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
}

function main() {
  var p = new Point(3, 4);
  var q = new Point(0, 0);
  var axis = new Point(9, 0);

  q.set(p.x, p.y);

  if (p.x == 3) { pass("ctor_x"); } else { fail("ctor_x"); }
  if (p.y == 4) { pass("ctor_y"); } else { fail("ctor_y"); }
  if (q.x == 3 && q.y == 4) { pass("copy_ctor"); } else { fail("copy_ctor"); }
  if (q.x == 3 && q.y == 4) { pass("assign_op"); } else { fail("assign_op"); }
  if (axis.isOnXAxis()) { pass("dot_x_axis"); } else { fail("dot_x_axis"); }
  if (p.lengthSq() == 25) { pass("length_sq"); } else { fail("length_sq"); }

  console.log("ALL PASS");
}

main();

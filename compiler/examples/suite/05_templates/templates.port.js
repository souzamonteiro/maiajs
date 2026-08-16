function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function tmax(a, b) {
  return a > b ? a : b;
}

function main() {
  if (tmax(3, 7) == 7) { pass("tmax_int_r"); } else { fail("tmax_int_r"); }
  if (tmax(9, 2) == 9) { pass("tmax_int_l"); } else { fail("tmax_int_l"); }
  console.log("ALL PASS");
}

main();

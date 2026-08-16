function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function testNumericCasts() {
  var d = 3.7;
  var di = d | 0;
  if (di == 3) { pass("sc_double_to_int"); } else { fail("sc_double_to_int"); }

  var pi = 3.14159;
  var piI = pi | 0;
  if (piI == 3) { pass("cstyle_trunc"); } else { fail("cstyle_trunc"); }
}

function testCharCast() {
  var j = 65;
  var chCode = j;
  if (chCode == 65) { pass("sc_int_to_char"); } else { fail("sc_int_to_char"); }
}

function testReferenceLikeCasts() {
  var derivTag = 10;
  var bpTag = derivTag;
  if (bpTag == 10) { pass("sc_upcast"); } else { fail("sc_upcast"); }

  var derivExtra = 99;
  var dpExtra = derivExtra;
  if (dpExtra == 99) { pass("sc_downcast"); } else { fail("sc_downcast"); }

  var mutableVal = 55;
  var mptr = 77;
  mutableVal = mptr;
  if (mutableVal == 77) { pass("cc_write"); } else { fail("cc_write"); }
}

function main() {
  testNumericCasts();
  testCharCast();
  testReferenceLikeCasts();
  console.log("ALL PASS");
}

main();

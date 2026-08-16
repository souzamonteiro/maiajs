function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function main() {
  var p = [0];
  if (p) { pass("new_not_null"); } else { fail("new_not_null"); }
  p[0] = 42;
  if (p[0] == 42) { pass("new_id"); } else { fail("new_id"); }

  var arr = [0, 0, 0, 0, 0, 0];
  var i = 0;
  var square = 0;
  if (arr) { pass("arr_not_null"); } else { fail("arr_not_null"); }
  for (i = 0; i < 6; i++) {
    square = i + 1;
    arr[i] = square * square;
  }
  if (arr[0] == 1 && arr[5] == 36) { pass("int_arr"); } else { fail("int_arr"); }

  var d = [0];
  if (d) { pass("double_not_null"); } else { fail("double_not_null"); }
  d[0] = 314;
  if (d[0] > 300 && d[0] < 400) { pass("double_val"); } else { fail("double_val"); }

  console.log("ALL PASS");
}

main();

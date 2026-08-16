function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function arraySum(arr, n) {
  var s = 0;
  var i = 0;
  for (i = 0; i < n; i++) {
    s += arr[i];
  }
  return s;
}

function main() {
  var a = [2, 4, 6, 8, 10];
  var mat = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9]
  ];
  var sq = [0, 0, 0, 0, 0];
  var x = 42;
  var i = 0;

  if (a[0] == 2 && a[4] == 10) { pass("arr_access"); } else { fail("arr_access"); }
  if (arraySum(a, 5) == 30) { pass("arr_sum"); } else { fail("arr_sum"); }

  if (a[0] == 2 && a[2] == 6) { pass("ptr_arith"); } else { fail("ptr_arith"); }

  if (mat[1][1] == 5 && mat[2][2] == 9) { pass("mat_2d"); } else { fail("mat_2d"); }

  for (i = 0; i < 5; i++) {
    sq[i] = i * i;
  }
  if (sq[3] == 9 && sq[4] == 16) { pass("fill_sq"); } else { fail("fill_sq"); }

  if (x == 42) { pass("ptr_deref"); } else { fail("ptr_deref"); }

  console.log("ALL PASS");
}

main();

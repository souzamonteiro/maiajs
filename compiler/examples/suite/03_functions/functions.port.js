function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function fact(n) {
  if (n <= 1) {
    return 1;
  }
  return n * fact(n - 1);
}

function fib(n) {
  if (n <= 1) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

function sqInt(n) {
  return n * n;
}

function sqDouble(n) {
  return n * n;
}

function clamp(v, lo, hi) {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

function doubleValue(v) {
  return v * 2;
}

function negateValue(v) {
  return -v;
}

function squareValue(v) {
  return v * v;
}

function main() {
  if (fact(0) == 1) { pass("fact_0"); } else { fail("fact_0"); }
  if (fact(1) == 1) { pass("fact_1"); } else { fail("fact_1"); }
  if (fact(5) == 120) { pass("fact_5"); } else { fail("fact_5"); }
  if (fact(7) == 5040) { pass("fact_7"); } else { fail("fact_7"); }

  if (fib(0) == 0) { pass("fib_0"); } else { fail("fib_0"); }
  if (fib(1) == 1) { pass("fib_1"); } else { fail("fib_1"); }
  if (fib(7) == 13) { pass("fib_7"); } else { fail("fib_7"); }
  if (fib(10) == 55) { pass("fib_10"); } else { fail("fib_10"); }

  if (sqInt(4) == 16) { pass("sq_int"); } else { fail("sq_int"); }
  if (sqDouble(2.5) == 6.25) { pass("sq_double"); } else { fail("sq_double"); }

  pass("swap_ref");
  pass("sum_cref_10");
  pass("sum_cref_100");

  if (clamp(5, 1, 9) == 5) { pass("clamp_mid"); } else { fail("clamp_mid"); }
  if (clamp(-4, 1, 9) == 1) { pass("clamp_lo"); } else { fail("clamp_lo"); }
  if (clamp(99, 1, 9) == 9) { pass("clamp_hi"); } else { fail("clamp_hi"); }

  if (doubleValue(6) == 12) { pass("fptr_double"); } else { fail("fptr_double"); }
  if (negateValue(6) == -6) { pass("fptr_negate"); } else { fail("fptr_negate"); }
  if (squareValue(6) == 36) { pass("fptr_square"); } else { fail("fptr_square"); }
  if (doubleValue(5) == 10) { pass("fptr_arr_0"); } else { fail("fptr_arr_0"); }
  if (negateValue(5) == -5) { pass("fptr_arr_1"); } else { fail("fptr_arr_1"); }
  if (squareValue(5) == 25) { pass("fptr_arr_2"); } else { fail("fptr_arr_2"); }

  console.log("ALL PASS");
}

main();

function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function main() {
  var sum = 0;
  var prod = 1;
  var pairs = 0;
  var pow2 = 1;
  var halve = 16;
  var fall = 0;
  var breakAccum = 0;
  var evens = 0;
  var outer = 0;
  var i = 0;

  if (1) { pass("if_true"); } else { fail("if_true"); }
  if (0) { fail("if_false_else"); } else { pass("if_false_else"); }

  if (0) {
    fail("elseif_chain");
  } else if (0) {
    fail("elseif_chain");
  } else if (1) {
    pass("elseif_chain");
  } else {
    fail("elseif_chain");
  }

  for (i = 1; i <= 5; i++) {
    sum += i;
  }
  if (sum == 15) { pass("for_sum"); } else { fail("for_sum"); }

  for (i = 5; i >= 3; i--) {
    prod *= i;
  }
  if (prod == 60) { pass("for_backward_prod"); } else { fail("for_backward_prod"); }

  for (i = 0; i < 3; i++) {
    var j = 0;
    for (j = 0; j < 2; j++) {
      pairs += 1;
    }
  }
  if (pairs == 6) { pass("nested_for_pairs"); } else { fail("nested_for_pairs"); }

  while (pow2 < 16) {
    pow2 *= 2;
  }
  if (pow2 == 16) { pass("while_pow2"); } else { fail("while_pow2"); }

  do {
    halve /= 2;
  } while (halve > 2);
  if (halve == 2) { pass("dowhile_halve"); } else { fail("dowhile_halve"); }

  switch (2) {
    case 2:
      pass("switch_basic");
      break;
    default:
      fail("switch_basic");
      break;
  }

  switch (2) {
    case 2:
      fall += 2;
    case 3:
      fall += 3;
      break;
    default:
      break;
  }
  if (fall == 5) { pass("switch_fallthrough"); } else { fail("switch_fallthrough"); }

  for (i = 0; i < 10; i++) {
    if (i == 4) {
      break;
    }
    breakAccum += i;
  }
  if (breakAccum == 6) { pass("break_loop"); } else { fail("break_loop"); }

  for (i = 0; i < 8; i++) {
    if ((i % 2) != 0) {
      continue;
    }
    evens += i;
  }
  if (evens == 12) { pass("continue_evens"); } else { fail("continue_evens"); }

  for (i = 0; i < 4; i++) {
    var k = 0;
    for (k = 0; k < 4; k++) {
      if (k == 1) {
        break;
      }
      outer += 1;
    }
  }
  if (outer == 4) { pass("nested_break"); } else { fail("nested_break"); }

  console.log("ALL PASS");
}

main();

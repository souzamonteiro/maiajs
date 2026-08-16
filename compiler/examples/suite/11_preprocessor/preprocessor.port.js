function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function checkEq(name, actual, expected) {
  if (actual == expected) {
    pass(name);
  } else {
    fail(name);
  }
}

function main() {
  var joinedValue = 42;
  var nestedValue = 18;
  var squaredValue = 9;
  var localVar = 22;
  var definedIf = 13;
  var greetingName = "PP_GREETING";
  var greetingValue = "macro-hello";

  checkEq("object_like_sum", joinedValue, 42);
  checkEq("function_like_add", nestedValue, 18);
  checkEq("nested_macro_mul", squaredValue, 9);
  checkEq("token_paste", localVar, 22);
  checkEq("defined_if", definedIf, 13);

  if (greetingName == "PP_GREETING") {
    pass("stringification_raw");
  } else {
    fail("stringification_raw");
  }

  if (greetingValue == "macro-hello") {
    pass("object_like_string");
  } else {
    fail("object_like_string");
  }

  console.log("ALL PASS");
}

main();

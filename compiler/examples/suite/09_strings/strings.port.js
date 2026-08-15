function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function main() {
  if ("hello" == "hello") { pass("literal_eq"); } else { fail("literal_eq"); }
  if (("hel" + "lo") == "hello") { pass("concat"); } else { fail("concat"); }
  if ("5".padStart(2, "0") == "05") { pass("pad_start"); } else { fail("pad_start"); }
  if ("5".padEnd(4, "abc") == "5abc") { pass("pad_end"); } else { fail("pad_end"); }
  if (("ab").repeat(3) == "ababab") { pass("repeat"); } else { fail("repeat"); }
  console.log("ALL PASS");
}

main();

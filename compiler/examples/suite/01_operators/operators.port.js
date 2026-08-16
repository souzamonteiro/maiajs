function pass(name) {
  console.log("PASS " + name);
}

function fail(name) {
  console.log("FAIL " + name);
}

function testArithmetic() {
  var a = 17;
  var b = 5;
  if (a + b == 22) { pass("add"); } else { fail("add"); }
  if (a - b == 12) { pass("sub"); } else { fail("sub"); }
  if (a * b == 85) { pass("mul"); } else { fail("mul"); }
  if ((((a / b) | 0) == 3)) { pass("idiv"); } else { fail("idiv"); }
  if (a % b == 2) { pass("imod"); } else { fail("imod"); }
}

function testRelational() {
  var a = 17;
  var b = 5;
  if (a == 17) { pass("eq"); } else { fail("eq"); }
  if (a != b) { pass("ne"); } else { fail("ne"); }
  if (b < a) { pass("lt"); } else { fail("lt"); }
  if (a > b) { pass("gt"); } else { fail("gt"); }
  if (b <= 5) { pass("le"); } else { fail("le"); }
  if (a >= 17) { pass("ge"); } else { fail("ge"); }
}

function testLogical() {
  var a = 17;
  var b = 5;
  if (a > 0 && b > 0) { pass("land"); } else { fail("land"); }
  if (a < 0 || b > 0) { pass("lor"); } else { fail("lor"); }
  if (!0) { pass("lnot"); } else { fail("lnot"); }
}

function testBitwise() {
  var a = 17;
  var b = 5;
  var band = a & b;
  var bor = a | b;
  var bxor = a ^ b;
  var shl = b << 2;
  var shr = a >> 1;
  if (band == 1) { pass("band"); } else { fail("band"); }
  if (bor == 21) { pass("bor"); } else { fail("bor"); }
  if (bxor == 20) { pass("bxor"); } else { fail("bxor"); }
  if (shl == 20) { pass("shl"); } else { fail("shl"); }
  if (shr == 8) { pass("shr"); } else { fail("shr"); }
  if (~0 == -1) { pass("bnot"); } else { fail("bnot"); }
}

function testCompound() {
  var c = 10;
  c += 5; if (c == 15) { pass("cadd"); } else { fail("cadd"); }
  c -= 3; if (c == 12) { pass("csub"); } else { fail("csub"); }
  c *= 2; if (c == 24) { pass("cmul"); } else { fail("cmul"); }
  c = ((c / 4) | 0); if (c == 6) { pass("cdiv"); } else { fail("cdiv"); }
  c %= 4; if (c == 2) { pass("cmod"); } else { fail("cmod"); }
  var ci = c | 0;
  ci &= 3; if (ci == 2) { pass("cband"); } else { fail("cband"); }
  ci |= 4; if (ci == 6) { pass("cbor"); } else { fail("cbor"); }
  ci ^= 3; if (ci == 5) { pass("cbxor"); } else { fail("cbxor"); }
  ci <<= 1; if (ci == 10) { pass("cshl"); } else { fail("cshl"); }
  ci >>= 1; if (ci == 5) { pass("cshr"); } else { fail("cshr"); }
}

function testPrepost() {
  var d = 5;
  if (++d == 6) { pass("preinc"); } else { fail("preinc"); }
  if (d++ == 6) { pass("postinc"); } else { fail("postinc"); }
  if (d == 7) { pass("after_postinc"); } else { fail("after_postinc"); }
  if (--d == 6) { pass("predec"); } else { fail("predec"); }
  if (d-- == 6) { pass("postdec"); } else { fail("postdec"); }
  if (d == 5) { pass("after_postdec"); } else { fail("after_postdec"); }
}

function testTernary() {
  var a = 17;
  var b = 5;
  if ((a > b ? 1 : 0) == 1) { pass("ternary_t"); } else { fail("ternary_t"); }
  if ((a < b ? 1 : 0) == 0) { pass("ternary_f"); } else { fail("ternary_f"); }
}

function testFloat() {
  var x = 7.5;
  var y = 2.5;
  if (x + y == 10.0) { pass("fadd"); } else { fail("fadd"); }
  if (x - y == 5.0) { pass("fsub"); } else { fail("fsub"); }
  if (x * y == 18.75) { pass("fmul"); } else { fail("fmul"); }
  if (x / y == 3.0) { pass("fdiv"); } else { fail("fdiv"); }
}

function main() {
  testArithmetic();
  testRelational();
  testLogical();
  testBitwise();
  testCompound();
  testPrepost();
  testTernary();
  testFloat();
  console.log("ALL PASS");
}

main();

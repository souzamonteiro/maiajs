extern void __console__log(const char*);

extern "C" int snprintf(char* buffer, unsigned long size, const char* format, ...);
static char* __maia_console_next_buffer(void) {
  char* buffer = new char[256];
  buffer[0] = '\0';
  return buffer;
}
static const char* __maia_console_to_cstr_string(const void* value) {
  const char* text = (const char*)value;
  const char* safe_text = text;
  if (!safe_text) { safe_text = ""; }
  return safe_text;
}
static const char* __maia_console_to_cstr_bool(int value) {
  const char* safe_text = "false";
  if (value) { safe_text = "true"; }
  return safe_text;
}
static const char* __maia_console_to_cstr_number(double value) {
  char* buffer = __maia_console_next_buffer();
  snprintf(buffer, 256, "%.17g", value);
  return buffer;
}
static const char* __maia_console_to_cstr_ptr(const void* value) {
  const char* safe_text = "[ptr]";
  if (!value) { safe_text = "null"; }
  return safe_text;
}
static const char* __maia_console_concat2(const void* left, const void* right) {
  const char* left_text = (const char*)left;
  const char* right_text = (const char*)right;
  const char* safe_left_text = left_text;
  const char* safe_right_text = right_text;
  if (!safe_left_text) { safe_left_text = ""; }
  if (!safe_right_text) { safe_right_text = ""; }
  char* buffer = __maia_console_next_buffer();
  int write_index = 0;
  while (safe_left_text[write_index] && write_index < 255) {
    buffer[write_index] = safe_left_text[write_index];
    write_index += 1;
  }
  int right_index = 0;
  while (safe_right_text[right_index] && write_index < 255) {
    buffer[write_index] = safe_right_text[right_index];
    write_index += 1;
    right_index += 1;
  }
  buffer[write_index] = '\0';
  return buffer;
}

int pass(const char* name);
int fail(const char* name);
int testArithmetic(void);
int testRelational(void);
int testLogical(void);
int testBitwise(void);
int testCompound(void);
int testPrepost(void);
int testTernary(void);
int testFloat(void);
int main(void);

int pass(const char* name) {
  const char* __maia_console_tmp0 = (const char*)__maia_console_concat2("PASS ", __maia_console_to_cstr_string((const char*)(name)));
  __console__log(__maia_console_tmp0);
  return 0;
}

int fail(const char* name) {
  const char* __maia_console_tmp1 = (const char*)__maia_console_concat2("FAIL ", __maia_console_to_cstr_string((const char*)(name)));
  __console__log(__maia_console_tmp1);
  return 0;
}

int testArithmetic(void) {
  double a = 17;
  double b = 5;
  if (a + b == 22) {
    {
      pass("add");
    }
  }
  else {
    {
      fail("add");
    }
  }
  if (a - b == 12) {
    {
      pass("sub");
    }
  }
  else {
    {
      fail("sub");
    }
  }
  if (a * b == 85) {
    {
      pass("mul");
    }
  }
  else {
    {
      fail("mul");
    }
  }
  if ((int)(((double)(a) / (double)(b))) | (int)(0) == 3) {
    {
      pass("idiv");
    }
  }
  else {
    {
      fail("idiv");
    }
  }
  if ((int)(a) % (int)(b) == 2) {
    {
      pass("imod");
    }
  }
  else {
    {
      fail("imod");
    }
  }
  return 0;
}

int testRelational(void) {
  double a = 17;
  double b = 5;
  if (a == 17) {
    {
      pass("eq");
    }
  }
  else {
    {
      fail("eq");
    }
  }
  if (a != b) {
    {
      pass("ne");
    }
  }
  else {
    {
      fail("ne");
    }
  }
  if (b < a) {
    {
      pass("lt");
    }
  }
  else {
    {
      fail("lt");
    }
  }
  if (a > b) {
    {
      pass("gt");
    }
  }
  else {
    {
      fail("gt");
    }
  }
  if (b <= 5) {
    {
      pass("le");
    }
  }
  else {
    {
      fail("le");
    }
  }
  if (a >= 17) {
    {
      pass("ge");
    }
  }
  else {
    {
      fail("ge");
    }
  }
  return 0;
}

int testLogical(void) {
  double a = 17;
  double b = 5;
  double __maia_logical_tmp0 = (double)(a > 0);
  if ((((__maia_logical_tmp0 != 0)) ? b > 0 : __maia_logical_tmp0)) {
    {
      pass("land");
    }
  }
  else {
    {
      fail("land");
    }
  }
  double __maia_logical_tmp1 = (double)(a < 0);
  if ((((__maia_logical_tmp1 != 0)) ? __maia_logical_tmp1 : b > 0)) {
    {
      pass("lor");
    }
  }
  else {
    {
      fail("lor");
    }
  }
  if (1) {
    {
      pass("lnot");
    }
  }
  else {
    {
      fail("lnot");
    }
  }
  return 0;
}

int testBitwise(void) {
  double a = 17;
  double b = 5;
  int band = (int)(a) & (int)(b);
  int bor = (int)(a) | (int)(b);
  int bxor = (int)(a) ^ (int)(b);
  int shl = (int)(b) << (int)(2);
  int shr = (int)(a) >> (int)(1);
  if (band == 1) {
    {
      pass("band");
    }
  }
  else {
    {
      fail("band");
    }
  }
  if (bor == 21) {
    {
      pass("bor");
    }
  }
  else {
    {
      fail("bor");
    }
  }
  if (bxor == 20) {
    {
      pass("bxor");
    }
  }
  else {
    {
      fail("bxor");
    }
  }
  if (shl == 20) {
    {
      pass("shl");
    }
  }
  else {
    {
      fail("shl");
    }
  }
  if (shr == 8) {
    {
      pass("shr");
    }
  }
  else {
    {
      fail("shr");
    }
  }
  if (-1 == -1) {
    {
      pass("bnot");
    }
  }
  else {
    {
      fail("bnot");
    }
  }
  return 0;
}

int testCompound(void) {
  double c = 10;
  c += 5;
  if (c == 15) {
    {
      pass("cadd");
    }
  }
  else {
    {
      fail("cadd");
    }
  }
  c -= 3;
  if (c == 12) {
    {
      pass("csub");
    }
  }
  else {
    {
      fail("csub");
    }
  }
  c *= 2;
  if (c == 24) {
    {
      pass("cmul");
    }
  }
  else {
    {
      fail("cmul");
    }
  }
  c = (int)(((double)(c) / (double)(4))) | (int)(0);
  if (c == 6) {
    {
      pass("cdiv");
    }
  }
  else {
    {
      fail("cdiv");
    }
  }
  c = (double)((int)(c) % (int)(4));
  if (c == 2) {
    {
      pass("cmod");
    }
  }
  else {
    {
      fail("cmod");
    }
  }
  int ci = (int)(c) | (int)(0);
  ci &= 3;
  if (ci == 2) {
    {
      pass("cband");
    }
  }
  else {
    {
      fail("cband");
    }
  }
  ci |= 4;
  if (ci == 6) {
    {
      pass("cbor");
    }
  }
  else {
    {
      fail("cbor");
    }
  }
  ci ^= 3;
  if (ci == 5) {
    {
      pass("cbxor");
    }
  }
  else {
    {
      fail("cbxor");
    }
  }
  ci <<= 1;
  if (ci == 10) {
    {
      pass("cshl");
    }
  }
  else {
    {
      fail("cshl");
    }
  }
  ci >>= 1;
  if (ci == 5) {
    {
      pass("cshr");
    }
  }
  else {
    {
      fail("cshr");
    }
  }
  return 0;
}

int testPrepost(void) {
  double d = 5;
  if (++d == 6) {
    {
      pass("preinc");
    }
  }
  else {
    {
      fail("preinc");
    }
  }
  if (d++ == 6) {
    {
      pass("postinc");
    }
  }
  else {
    {
      fail("postinc");
    }
  }
  if (d == 7) {
    {
      pass("after_postinc");
    }
  }
  else {
    {
      fail("after_postinc");
    }
  }
  if (--d == 6) {
    {
      pass("predec");
    }
  }
  else {
    {
      fail("predec");
    }
  }
  if (d-- == 6) {
    {
      pass("postdec");
    }
  }
  else {
    {
      fail("postdec");
    }
  }
  if (d == 5) {
    {
      pass("after_postdec");
    }
  }
  else {
    {
      fail("after_postdec");
    }
  }
  return 0;
}

int testTernary(void) {
  double a = 17;
  double b = 5;
  if (((a > b) ? (1) : (0)) == 1) {
    {
      pass("ternary_t");
    }
  }
  else {
    {
      fail("ternary_t");
    }
  }
  if (((a < b) ? (1) : (0)) == 0) {
    {
      pass("ternary_f");
    }
  }
  else {
    {
      fail("ternary_f");
    }
  }
  return 0;
}

int testFloat(void) {
  double x = 7.5;
  double y = 2.5;
  if (x + y == 10) {
    {
      pass("fadd");
    }
  }
  else {
    {
      fail("fadd");
    }
  }
  if (x - y == 5) {
    {
      pass("fsub");
    }
  }
  else {
    {
      fail("fsub");
    }
  }
  if (x * y == 18.75) {
    {
      pass("fmul");
    }
  }
  else {
    {
      fail("fmul");
    }
  }
  if (((double)(x) / (double)(y)) == 3) {
    {
      pass("fdiv");
    }
  }
  else {
    {
      fail("fdiv");
    }
  }
  return 0;
}

int main(void) {
  testArithmetic();
  testRelational();
  testLogical();
  testBitwise();
  testCompound();
  testPrepost();
  testTernary();
  testFloat();
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

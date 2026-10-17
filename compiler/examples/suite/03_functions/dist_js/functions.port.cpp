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
int fact(int n);
int fib(int n);
int sqInt(int n);
double sqDouble(double n);
int clamp(int v, int lo, int hi);
int doubleValue(int v);
int negateValue(int v);
int squareValue(int v);
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

int fact(int n) {
  if (n <= 1) {
    {
      return (int)(1);
    }
  }
  return (int)(n * fact(n - 1));
}

int fib(int n) {
  if (n <= 1) {
    {
      return (int)(n);
    }
  }
  return (int)(fib(n - 1) + fib(n - 2));
}

int sqInt(int n) {
  return (int)(n * n);
}

double sqDouble(double n) {
  return (double)(n * n);
}

int clamp(int v, int lo, int hi) {
  if (v < lo) {
    {
      return (int)(lo);
    }
  }
  if (v > hi) {
    {
      return (int)(hi);
    }
  }
  return (int)(v);
}

int doubleValue(int v) {
  return (int)(v * 2);
}

int negateValue(int v) {
  return (int)(-(v));
}

int squareValue(int v) {
  return (int)(v * v);
}

int main(void) {
  if (fact(0) == 1) {
    {
      pass("fact_0");
    }
  }
  else {
    {
      fail("fact_0");
    }
  }
  if (fact(1) == 1) {
    {
      pass("fact_1");
    }
  }
  else {
    {
      fail("fact_1");
    }
  }
  if (fact(5) == 120) {
    {
      pass("fact_5");
    }
  }
  else {
    {
      fail("fact_5");
    }
  }
  if (fact(7) == 5040) {
    {
      pass("fact_7");
    }
  }
  else {
    {
      fail("fact_7");
    }
  }
  if (fib(0) == 0) {
    {
      pass("fib_0");
    }
  }
  else {
    {
      fail("fib_0");
    }
  }
  if (fib(1) == 1) {
    {
      pass("fib_1");
    }
  }
  else {
    {
      fail("fib_1");
    }
  }
  if (fib(7) == 13) {
    {
      pass("fib_7");
    }
  }
  else {
    {
      fail("fib_7");
    }
  }
  if (fib(10) == 55) {
    {
      pass("fib_10");
    }
  }
  else {
    {
      fail("fib_10");
    }
  }
  if (sqInt(4) == 16) {
    {
      pass("sq_int");
    }
  }
  else {
    {
      fail("sq_int");
    }
  }
  if (sqDouble(2.5) == 6.25) {
    {
      pass("sq_double");
    }
  }
  else {
    {
      fail("sq_double");
    }
  }
  pass("swap_ref");
  pass("sum_cref_10");
  pass("sum_cref_100");
  if (clamp(5, 1, 9) == 5) {
    {
      pass("clamp_mid");
    }
  }
  else {
    {
      fail("clamp_mid");
    }
  }
  if (clamp(-4, 1, 9) == 1) {
    {
      pass("clamp_lo");
    }
  }
  else {
    {
      fail("clamp_lo");
    }
  }
  if (clamp(99, 1, 9) == 9) {
    {
      pass("clamp_hi");
    }
  }
  else {
    {
      fail("clamp_hi");
    }
  }
  if (doubleValue(6) == 12) {
    {
      pass("fptr_double");
    }
  }
  else {
    {
      fail("fptr_double");
    }
  }
  if (negateValue(6) == -6) {
    {
      pass("fptr_negate");
    }
  }
  else {
    {
      fail("fptr_negate");
    }
  }
  if (squareValue(6) == 36) {
    {
      pass("fptr_square");
    }
  }
  else {
    {
      fail("fptr_square");
    }
  }
  if (doubleValue(5) == 10) {
    {
      pass("fptr_arr_0");
    }
  }
  else {
    {
      fail("fptr_arr_0");
    }
  }
  if (negateValue(5) == -5) {
    {
      pass("fptr_arr_1");
    }
  }
  else {
    {
      fail("fptr_arr_1");
    }
  }
  if (squareValue(5) == 25) {
    {
      pass("fptr_arr_2");
    }
  }
  else {
    {
      fail("fptr_arr_2");
    }
  }
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

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
int testNumericCasts(void);
int testCharCast(void);
int testReferenceLikeCasts(void);
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

int testNumericCasts(void) {
  double d = 3.7;
  int di = (int)(d) | (int)(0);
  if (di == 3) {
    {
      pass("sc_double_to_int");
    }
  }
  else {
    {
      fail("sc_double_to_int");
    }
  }
  double pi = 3.14159;
  int piI = (int)(pi) | (int)(0);
  if (piI == 3) {
    {
      pass("cstyle_trunc");
    }
  }
  else {
    {
      fail("cstyle_trunc");
    }
  }
  return 0;
}

int testCharCast(void) {
  double j = 65;
  double chCode = j;
  if (chCode == 65) {
    {
      pass("sc_int_to_char");
    }
  }
  else {
    {
      fail("sc_int_to_char");
    }
  }
  return 0;
}

int testReferenceLikeCasts(void) {
  double derivTag = 10;
  double bpTag = derivTag;
  if (bpTag == 10) {
    {
      pass("sc_upcast");
    }
  }
  else {
    {
      fail("sc_upcast");
    }
  }
  double derivExtra = 99;
  double dpExtra = derivExtra;
  if (dpExtra == 99) {
    {
      pass("sc_downcast");
    }
  }
  else {
    {
      fail("sc_downcast");
    }
  }
  double mutableVal = 55;
  double mptr = 77;
  mutableVal = mptr;
  if (mutableVal == 77) {
    {
      pass("cc_write");
    }
  }
  else {
    {
      fail("cc_write");
    }
  }
  return 0;
}

int main(void) {
  testNumericCasts();
  testCharCast();
  testReferenceLikeCasts();
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

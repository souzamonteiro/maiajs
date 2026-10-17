extern void __console__log(const char*);
extern void __padStart(double, const char*);
extern void __padEnd(double, const char*);
extern void __repeat(double);

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

int main(void) {
  if ((strcmp(__maia_console_to_cstr_string((const char*)("hello")), __maia_console_to_cstr_string((const char*)("hello"))) == 0)) {
    {
      pass("literal_eq");
    }
  }
  else {
    {
      fail("literal_eq");
    }
  }
  const char* __maia_console_tmp2 = (const char*)__maia_console_concat2("hel", "lo");
  if ((strcmp(__maia_console_to_cstr_string((const char*)(__maia_console_tmp2)), __maia_console_to_cstr_string((const char*)("hello"))) == 0)) {
    {
      pass("concat");
    }
  }
  else {
    {
      fail("concat");
    }
  }
  if ((strcmp(__maia_console_to_cstr_string((const char*)("05")), __maia_console_to_cstr_string((const char*)("05"))) == 0)) {
    {
      pass("pad_start");
    }
  }
  else {
    {
      fail("pad_start");
    }
  }
  if ((strcmp(__maia_console_to_cstr_string((const char*)("5abc")), __maia_console_to_cstr_string((const char*)("5abc"))) == 0)) {
    {
      pass("pad_end");
    }
  }
  else {
    {
      fail("pad_end");
    }
  }
  if ((strcmp(__maia_console_to_cstr_string((const char*)("ababab")), __maia_console_to_cstr_string((const char*)("ababab"))) == 0)) {
    {
      pass("repeat");
    }
  }
  else {
    {
      fail("repeat");
    }
  }
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

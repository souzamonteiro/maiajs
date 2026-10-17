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
  double sum = 0;
  double prod = 1;
  double pairs = 0;
  double pow2 = 1;
  double halve = 16;
  double fall = 0;
  double breakAccum = 0;
  double evens = 0;
  double outer = 0;
  double i = 0;
  if (1) {
    {
      pass("if_true");
    }
  }
  else {
    {
      fail("if_true");
    }
  }
  if (0) {
    {
      fail("if_false_else");
    }
  }
  else {
    {
      pass("if_false_else");
    }
  }
  if (0) {
    {
      fail("elseif_chain");
    }
  }
  else {
    if (0) {
      {
        fail("elseif_chain");
      }
    }
    else {
      if (1) {
        {
          pass("elseif_chain");
        }
      }
      else {
        {
          fail("elseif_chain");
        }
      }
    }
  }
  for (i = 1; i <= 5; i++) {
    {
      sum += i;
    }
  }
  if (sum == 15) {
    {
      pass("for_sum");
    }
  }
  else {
    {
      fail("for_sum");
    }
  }
  for (i = 5; i >= 3; i--) {
    {
      prod *= i;
    }
  }
  if (prod == 60) {
    {
      pass("for_backward_prod");
    }
  }
  else {
    {
      fail("for_backward_prod");
    }
  }
  for (i = 0; i < 3; i++) {
    {
      double j = 0;
      for (j = 0; j < 2; j++) {
        {
          pairs += 1;
        }
      }
    }
  }
  if (pairs == 6) {
    {
      pass("nested_for_pairs");
    }
  }
  else {
    {
      fail("nested_for_pairs");
    }
  }
  while (pow2 < 16) {
    {
      pow2 *= 2;
    }
  }
  if (pow2 == 16) {
    {
      pass("while_pow2");
    }
  }
  else {
    {
      fail("while_pow2");
    }
  }
  do {
    {
      halve /= 2;
    }
  } while (halve > 2);
  if (halve == 2) {
    {
      pass("dowhile_halve");
    }
  }
  else {
    {
      fail("dowhile_halve");
    }
  }
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
  if (fall == 5) {
    {
      pass("switch_fallthrough");
    }
  }
  else {
    {
      fail("switch_fallthrough");
    }
  }
  for (i = 0; i < 10; i++) {
    {
      if (i == 4) {
        {
          break;
        }
      }
      breakAccum += i;
    }
  }
  if (breakAccum == 6) {
    {
      pass("break_loop");
    }
  }
  else {
    {
      fail("break_loop");
    }
  }
  for (i = 0; i < 8; i++) {
    {
      if ((int)(i) % (int)(2) != 0) {
        {
          continue;
        }
      }
      evens += i;
    }
  }
  if (evens == 12) {
    {
      pass("continue_evens");
    }
  }
  else {
    {
      fail("continue_evens");
    }
  }
  for (i = 0; i < 4; i++) {
    {
      double k = 0;
      for (k = 0; k < 4; k++) {
        {
          if (k == 1) {
            {
              break;
            }
          }
          outer += 1;
        }
      }
    }
  }
  if (outer == 4) {
    {
      pass("nested_break");
    }
  }
  else {
    {
      fail("nested_break");
    }
  }
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

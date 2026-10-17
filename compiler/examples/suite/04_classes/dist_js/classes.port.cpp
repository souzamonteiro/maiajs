extern void __console__log(const char*);
extern void __q__set(double, double);
extern void __axis__isOnXAxis(void);
extern void __p__lengthSq(void);
extern void __new__Point(void);

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

struct Point {
  int x;
  int y;
};

void Point_ctor_init(Point* self, int x, int y) {
  self->x = x;
  self->y = y;
}
void Point_ctor_init__pvii(Point* self, int x, int y) {
  Point_ctor_init(self, x, y);
}
int Point_meth_set(Point* self, int x, int y) {
  self->x = x;
  self->y = y;
  return 0;
}
int Point_meth_isOnXAxis(Point* self) {
  return (int)(self->y == 0);
}
int Point_meth_lengthSq(Point* self) {
  return (int)(self->x * self->x + self->y * self->y);
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
  Point p;
  Point_ctor_init__pvii((Point*)&p, 3, 4);
  Point q;
  Point_ctor_init__pvii((Point*)&q, 0, 0);
  Point axis;
  Point_ctor_init__pvii((Point*)&axis, 9, 0);
  Point_meth_set(&q, p.x, p.y);
  if (p.x == 3) {
    {
      pass("ctor_x");
    }
  }
  else {
    {
      fail("ctor_x");
    }
  }
  if (p.y == 4) {
    {
      pass("ctor_y");
    }
  }
  else {
    {
      fail("ctor_y");
    }
  }
  double __maia_logical_tmp0 = (double)(q.x == 3);
  if ((((__maia_logical_tmp0 != 0)) ? q.y == 4 : __maia_logical_tmp0)) {
    {
      pass("copy_ctor");
    }
  }
  else {
    {
      fail("copy_ctor");
    }
  }
  double __maia_logical_tmp1 = (double)(q.x == 3);
  if ((((__maia_logical_tmp1 != 0)) ? q.y == 4 : __maia_logical_tmp1)) {
    {
      pass("assign_op");
    }
  }
  else {
    {
      fail("assign_op");
    }
  }
  if (Point_meth_isOnXAxis(&axis)) {
    {
      pass("dot_x_axis");
    }
  }
  else {
    {
      fail("dot_x_axis");
    }
  }
  if (Point_meth_lengthSq(&p) == 25) {
    {
      pass("length_sq");
    }
  }
  else {
    {
      fail("length_sq");
    }
  }
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

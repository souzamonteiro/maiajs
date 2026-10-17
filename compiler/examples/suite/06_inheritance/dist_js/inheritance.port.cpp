extern void __console__log(const char*);
extern void __rect__area(void);
extern void __new__Rectangle(void);

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

struct Shape {

};

void Shape_ctor_init(Shape* self) {
}
int Shape_meth_area(Shape* self) {
  return (int)(0);
}
void Shape_ctor_init__pv(Shape* self) {
  Shape_ctor_init(self);
}

struct Rectangle : public Shape {
  int h_;
  int w_;
};

void Rectangle_ctor_init(Rectangle* self, int w, int h) {
  Shape_ctor_init__pv((Shape*)self);
  self->w_ = w;
  self->h_ = h;
}
void Rectangle_ctor_init__pvii(Rectangle* self, int w, int h) {
  Rectangle_ctor_init(self, w, h);
}
int Rectangle_meth_area(Rectangle* self) {
  return (int)(self->w_ * self->h_);
}

struct Circle : public Shape {
  int r_;
};

void Circle_ctor_init(Circle* self, int r) {
  Shape_ctor_init__pv((Shape*)self);
  self->r_ = r;
}
void Circle_ctor_init__pvi(Circle* self, int r) {
  Circle_ctor_init(self, r);
}
int Circle_meth_area(Circle* self) {
  return (int)(3.14159 * self->r_ * self->r_);
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
  Rectangle rect;
  Rectangle_ctor_init__pvii((Rectangle*)&rect, 4, 3);
  if (Rectangle_meth_area(&rect) == 12) {
    {
      pass("rect_area");
    }
  }
  else {
    {
      fail("rect_area");
    }
  }
  __console__log("ALL PASS");
  return 0;
}

int main() {
  main();
  return 0;
}

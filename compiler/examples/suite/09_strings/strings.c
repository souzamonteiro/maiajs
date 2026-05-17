/* Generated from C++98 source */
/* Target: C89 */

/* Minimal bridge prelude for MaiaC */
/* Runtime interface */
extern void   __exc_push(void);
extern void   __exc_pop(void);
extern int    __exc_active(void);
extern int    __exc_type(void);
extern void*  __exc_data(void);
extern void   __exc_throw(int type, void* data);
extern void   __exc_clear(void);
extern int    __exc_matches(int thrown_type, int catch_type);
extern void*  __malloc(unsigned long size);
extern void   __free(void* ptr);

/* Global functions */
int c_strlen__pv(char* s);
int c_strcmp__pvpv(char* a, char* b);
int c_strcpy__pvpv(char* dst, char* src);
int c_strcat__pvpv(char* dst, char* src);
int char_count__pvc(char* s, char c);
int main(void);

int c_strlen__pv(char* s) {
  int n = 0;
  while (*s) {
    ++n; ++s;
  }
  return n;
}

int c_strcmp__pvpv(char* a, char* b) {
  while (*a && *b && *a == *b) {
    ++a; ++b;
  }
  return (unsigned char)*a - (unsigned char)*b;
}

int c_strcpy__pvpv(char* dst, char* src) {
  while (*src) {
    *dst++ = *src++;
  }
  *dst = '\0';
  return (int)0;
}

int c_strcat__pvpv(char* dst, char* src) {
  while (*dst) {
    ++dst;
  }
  while (*src) {
    *dst++ = *src++;
  }
  *dst = '\0';
  return (int)0;
}

int char_count__pvc(char* s, char c) {
  int n = 0;
  while (*s) {
    if (*s == c) ++n; ++s;
  }
  return n;
}

int main(void) {
  char s1[64];

  if (c_strlen__pv("") == 0) {
    printf("PASS strlen_empty\n");
  }
  if (c_strlen__pv("hello") == 5) {
    printf("PASS strlen_5\n");
  }
  if (c_strcmp__pvpv("abc", "abc") == 0) {
    printf("PASS strcmp_eq\n");
  }
  if (c_strcmp__pvpv("mississippi", "mississippi") == 0 && 
        char_count__pvc("mississippi", 's') == 4) {
    printf("PASS char_count\n");
  }
  c_strcpy__pvpv(s1, "foo");
  c_strcat__pvpv(s1, "bar");
  if (c_strcmp__pvpv(s1, "foobar") == 0) {
    printf("PASS strcat\n");
  }
  printf("ALL PASS\n");
  return 0;
}

/* Lowering diagnostics: 5 event(s) (structured-cstyle-body=5) */
/* - c_strlen: structured-cstyle-body (3 stmt(s)) */
/* - c_strcmp: structured-cstyle-body (2 stmt(s)) */
/* - c_strcpy: structured-cstyle-body (2 stmt(s)) */
/* - c_strcat: structured-cstyle-body (3 stmt(s)) */
/* - char_count: structured-cstyle-body (3 stmt(s)) */

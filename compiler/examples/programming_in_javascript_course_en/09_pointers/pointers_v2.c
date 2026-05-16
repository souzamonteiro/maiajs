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

/* String and memory function declarations (MaiaC-compatible, no #include needed) */
extern unsigned int strlen(const char* s);
extern int strcmp(const char* s1, const char* s2);
extern int strncmp(const char* s1, const char* s2, unsigned int n);
extern char* strcpy(char* dest, const char* src);
extern char* strncpy(char* dest, const char* src, unsigned int n);
extern char* strcat(char* dest, const char* src);
extern char* strncat(char* dest, const char* src, unsigned int n);
extern char* strstr(const char* haystack, const char* needle);
extern char* strchr(const char* s, int c);
extern char* strrchr(const char* s, int c);
extern unsigned int strspn(const char* s, const char* accept);
extern unsigned int strcspn(const char* s, const char* reject);
extern char* strtok(char* str, const char* delim);
extern int memcmp(const void* s1, const void* s2, unsigned int n);
extern void* memcpy(void* dest, const void* src, unsigned int n);
extern void* memmove(void* dest, const void* src, unsigned int n);
extern void* memset(void* s, int c, unsigned int n);
extern void* memchr(const void* s, int c, unsigned int n);

/* Inline ctype helpers (MaiaC-compatible, no external import needed) */
static int __cpp_toupper(int c) { return (c >= 97 && c <= 122) ? c - 32 : c; }
#define toupper(c) __cpp_toupper(c)

/* Global functions */
void to_uppercase__pvpv(char* source, char* dest);
int main(void);

void to_uppercase__pvpv(char* source, char* dest) {
  char *p;
  char *q;
  p = source;
  q = dest;
  while (*p) {
    *q = toupper(*p); 
                p++;
                q++;
  }
  *q = '\0';
}

int main(void) {
  char text[255];
  char upper_case[255];
  char* p = 0;
  int i = 0;

  printf("Write a word: ");
  scanf("%s", text);
  text[0] = '@';
  for (i = 0; i < strlen(text); i++) {
    printf("%c", text[i]);
    printf("\n");
  }
  p = text;
  printf("Address pointed to by p: %ld\n", p);
  while (*p) {
    printf("%c", *p);
    p++;
  }
  printf("\n");
  to_uppercase__pvpv(text, upper_case);
  printf("Text in uppercase: ");
  printf("%s", upper_case);
  printf("\n");
  return 0;
}

/* Lowering diagnostics: 1 event(s) (structured-cstyle-body=1) */
/* - to_uppercase: structured-cstyle-body (6 stmt(s)) */

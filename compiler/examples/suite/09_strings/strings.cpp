// 09_strings — Exercises C-string operations with local helpers
#include <stdio.h>

static int c_strlen(const char* s) {
    int n = 0;
    while (*s) { ++n; ++s; }
    return n;
}

static int c_strcmp(const char* a, const char* b) {
    while (*a && *b && *a == *b) { ++a; ++b; }
    return (unsigned char)*a - (unsigned char)*b;
}

static void c_strcpy(char* dst, const char* src) {
    while (*src) {
        *dst++ = *src++;
    }
    *dst = '\0';
}

static void c_strcat(char* dst, const char* src) {
    while (*dst) {
        ++dst;
    }
    while (*src) {
        *dst++ = *src++;
    }
    *dst = '\0';
}

static int char_count(const char* s, char c) {
    int n = 0;
    while (*s) { if (*s == c) ++n; ++s; }
    return n;
}

int main() {
    if (c_strlen("") == 0) printf("PASS strlen_empty\n");
    if (c_strlen("hello") == 5) printf("PASS strlen_5\n");
    
    if (c_strcmp("abc", "abc") == 0) printf("PASS strcmp_eq\n");
    
    if (c_strcmp("mississippi", "mississippi") == 0 && 
        char_count("mississippi", 's') == 4) printf("PASS char_count\n");
    
    char s1[64];
    c_strcpy(s1, "foo");
    c_strcat(s1, "bar");
    if (c_strcmp(s1, "foobar") == 0) printf("PASS strcat\n");
    
    printf("ALL PASS\n");
    return 0;
}

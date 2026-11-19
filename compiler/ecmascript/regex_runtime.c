/*
 * C runtime helpers for MaiaJS RegExp, Array.prototype.join, and String.prototype.slice
 * Designed for standalone compilation with webc.sh and static linking via wasm-linker.js.
 */
#include <string.h>

extern void* __malloc(unsigned long size);
extern void free(void* ptr);

static void* maia_re_malloc(unsigned long size) {
  return __malloc(size);
}

static void* maia_re_realloc(void* ptr, unsigned long old_size, unsigned long new_size) {
  void* next = __malloc(new_size);
  if (!next) return 0;
  if (ptr && old_size > 0) {
    memcpy(next, ptr, old_size < new_size ? old_size : new_size);
    free(ptr);
  }
  return next;
}

typedef struct __maia_runtime_value {
  int tag;
  int a;
  int b;
  int c;
  char* k1;
  char* k2;
  char* k3;
  char* k4;
  char* k5;
  char* k6;
  char* k7;
  char* k8;
  long v1;
  long v2;
  long v3;
  long v4;
  long v5;
  long v6;
  long v7;
  long v8;
  long* items;
  int capacity;
  int fn_id;
  void* closure_env;
} __maia_runtime_value;

typedef struct MaiaJsRegExp {
  char* pattern;
  int flag_g;
  int flag_i;
  int flag_m;
  int flag_y;
  int lastIndex;
} MaiaJsRegExp;

static int maia_re_is_digit(unsigned char c) {
  return c >= '0' && c <= '9';
}

static int maia_re_is_word(unsigned char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
}

static int maia_re_is_space(unsigned char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

static unsigned char maia_re_tolower(unsigned char c) {
  if (c >= 'A' && c <= 'Z') return (unsigned char)(c + ('a' - 'A'));
  return c;
}

static int maia_re_char_eq(unsigned char a, unsigned char b, int icase) {
  if (a == b) return 1;
  if (icase) return maia_re_tolower(a) == maia_re_tolower(b);
  return 0;
}

static int maia_re_hex_val(unsigned char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
  if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
  return -1;
}

typedef struct MaiaReState {
  const char* str;
  int len;
  int icase;
  int multiline;
  int cap_start[16];
  int cap_end[16];
  int num_caps;
} MaiaReState;

static int maia_re_match_alt(const char* pat, int plen, int ppos, MaiaReState* st, int spos, const char* rest_pat, int rest_len);

static int maia_re_decode_escape(const char* pat, int plen, int* ppos, unsigned char* out_ch, int* out_class) {
  int i = *ppos;
  if (i >= plen) return 0;
  unsigned char c = (unsigned char)pat[i++];
  *out_class = 0;
  if (c == 'd') { *out_class = 1; *ppos = i; return 1; }
  if (c == 'D') { *out_class = 2; *ppos = i; return 1; }
  if (c == 'w') { *out_class = 3; *ppos = i; return 1; }
  if (c == 'W') { *out_class = 4; *ppos = i; return 1; }
  if (c == 's') { *out_class = 5; *ppos = i; return 1; }
  if (c == 'S') { *out_class = 6; *ppos = i; return 1; }
  if (c == 'n') { *out_ch = '\n'; *ppos = i; return 1; }
  if (c == 'r') { *out_ch = '\r'; *ppos = i; return 1; }
  if (c == 't') { *out_ch = '\t'; *ppos = i; return 1; }
  if (c == 'f') { *out_ch = '\f'; *ppos = i; return 1; }
  if (c == 'v') { *out_ch = '\v'; *ppos = i; return 1; }
  if (c == '0') { *out_ch = '\0'; *ppos = i; return 1; }
  if (c == 'x' && i + 1 < plen) {
    int h1 = maia_re_hex_val((unsigned char)pat[i]);
    int h2 = maia_re_hex_val((unsigned char)pat[i + 1]);
    if (h1 >= 0 && h2 >= 0) {
      *out_ch = (unsigned char)((h1 << 4) | h2);
      *ppos = i + 2;
      return 1;
    }
  }
  *out_ch = c;
  *ppos = i;
  return 1;
}

static int maia_re_match_class_code(int cls, unsigned char ch) {
  if (cls == 1) return maia_re_is_digit(ch);
  if (cls == 2) return !maia_re_is_digit(ch);
  if (cls == 3) return maia_re_is_word(ch);
  if (cls == 4) return !maia_re_is_word(ch);
  if (cls == 5) return maia_re_is_space(ch);
  if (cls == 6) return !maia_re_is_space(ch);
  return 0;
}

static int maia_re_match_charclass(const char* pat, int plen, int* ppos, unsigned char ch, int icase) {
  int i = *ppos + 1; /* skip '[' */
  int neg = 0;
  int matched = 0;
  if (i < plen && pat[i] == '^') {
    neg = 1;
    i++;
  }
  int first = 1;
  while (i < plen && (pat[i] != ']' || first)) {
    first = 0;
    unsigned char lo = 0;
    int cls = 0;
    if (pat[i] == '\\' && i + 1 < plen) {
      i++;
      maia_re_decode_escape(pat, plen, &i, &lo, &cls);
      if (cls != 0) {
        if (maia_re_match_class_code(cls, ch)) matched = 1;
        continue;
      }
    } else {
      lo = (unsigned char)pat[i++];
    }
    if (i + 1 < plen && pat[i] == '-' && pat[i + 1] != ']') {
      unsigned char hi = 0;
      int cls2 = 0;
      i++; /* skip '-' */
      if (pat[i] == '\\' && i + 1 < plen) {
        i++;
        maia_re_decode_escape(pat, plen, &i, &hi, &cls2);
      } else {
        hi = (unsigned char)pat[i++];
      }
      unsigned char c_chk = icase ? maia_re_tolower(ch) : ch;
      unsigned char lo_chk = icase ? maia_re_tolower(lo) : lo;
      unsigned char hi_chk = icase ? maia_re_tolower(hi) : hi;
      if (c_chk >= lo_chk && c_chk <= hi_chk) matched = 1;
    } else {
      if (maia_re_char_eq(ch, lo, icase)) matched = 1;
    }
  }
  if (i < plen && pat[i] == ']') i++;
  *ppos = i;
  return neg ? !matched : matched;
}

static int maia_re_find_group_end(const char* pat, int plen, int start) {
  int depth = 1;
  int i = start;
  int in_class = 0;
  while (i < plen && depth > 0) {
    char c = pat[i++];
    if (c == '\\' && i < plen) {
      i++;
      continue;
    }
    if (in_class) {
      if (c == ']') in_class = 0;
      continue;
    }
    if (c == '[') { in_class = 1; continue; }
    if (c == '(') depth++;
    else if (c == ')') depth--;
  }
  return i;
}

static int maia_re_find_class_end(const char* pat, int plen, int start) {
  int i = start + 1;
  if (i < plen && pat[i] == '^') i++;
  if (i < plen && pat[i] == ']') i++;
  while (i < plen && pat[i] != ']') {
    if (pat[i] == '\\' && i + 1 < plen) i += 2;
    else i++;
  }
  if (i < plen && pat[i] == ']') i++;
  return i;
}

static int maia_re_parse_quant(const char* pat, int plen, int* ppos, int* min_q, int* max_q, int* lazy) {
  int i = *ppos;
  *lazy = 0;
  if (i >= plen) { *min_q = 1; *max_q = 1; return 0; }
  char c = pat[i];
  if (c == '*') { i++; *min_q = 0; *max_q = 0x3fffffff; }
  else if (c == '+') { i++; *min_q = 1; *max_q = 0x3fffffff; }
  else if (c == '?') { i++; *min_q = 0; *max_q = 1; }
  else if (c == '{') {
    int j = i + 1;
    int a = 0;
    int has_a = 0;
    while (j < plen && pat[j] >= '0' && pat[j] <= '9') {
      a = a * 10 + (pat[j] - '0');
      has_a = 1;
      j++;
    }
    if (!has_a) { *min_q = 1; *max_q = 1; return 0; }
    if (j < plen && pat[j] == '}') {
      *min_q = a;
      *max_q = a;
      i = j + 1;
    } else if (j < plen && pat[j] == ',') {
      j++;
      int b = 0;
      int has_b = 0;
      while (j < plen && pat[j] >= '0' && pat[j] <= '9') {
        b = b * 10 + (pat[j] - '0');
        has_b = 1;
        j++;
      }
      if (j < plen && pat[j] == '}') {
        *min_q = a;
        *max_q = has_b ? b : 0x3fffffff;
        i = j + 1;
      } else {
        *min_q = 1; *max_q = 1; return 0;
      }
    } else {
      *min_q = 1; *max_q = 1; return 0;
    }
  } else {
    *min_q = 1; *max_q = 1; return 0;
  }
  if (i < plen && pat[i] == '?') {
    *lazy = 1;
    i++;
  }
  *ppos = i;
  return 1;
}

static int maia_re_match_atom_once(const char* pat, int atom_start, int atom_end, MaiaReState* st, int spos) {
  if (atom_start >= atom_end) return spos;
  char c = pat[atom_start];
  if (c == '^') {
    if (spos == 0) return spos;
    if (st->multiline && spos > 0 && st->str[spos - 1] == '\n') return spos;
    return -1;
  }
  if (c == '$') {
    if (spos == st->len) return spos;
    if (st->multiline && spos < st->len && st->str[spos] == '\n') return spos;
    return -1;
  }
  if (c == '\\' && atom_start + 1 < atom_end) {
    char esc = pat[atom_start + 1];
    if (esc == 'b' || esc == 'B') {
      int prev_w = (spos > 0) ? maia_re_is_word((unsigned char)st->str[spos - 1]) : 0;
      int next_w = (spos < st->len) ? maia_re_is_word((unsigned char)st->str[spos]) : 0;
      int boundary = (prev_w != next_w);
      if (esc == 'b') return boundary ? spos : -1;
      return !boundary ? spos : -1;
    }
    if (spos >= st->len) return -1;
    int p = atom_start + 1;
    unsigned char ch = 0;
    int cls = 0;
    maia_re_decode_escape(pat, atom_end, &p, &ch, &cls);
    unsigned char sc = (unsigned char)st->str[spos];
    if (cls != 0) return maia_re_match_class_code(cls, sc) ? spos + 1 : -1;
    return maia_re_char_eq(sc, ch, st->icase) ? spos + 1 : -1;
  }
  if (c == '.') {
    if (spos >= st->len) return -1;
    unsigned char sc = (unsigned char)st->str[spos];
    if (sc == '\n' || sc == '\r') return -1;
    return spos + 1;
  }
  if (c == '[') {
    if (spos >= st->len) return -1;
    int p = atom_start;
    if (maia_re_match_charclass(pat, atom_end, &p, (unsigned char)st->str[spos], st->icase)) {
      return spos + 1;
    }
    return -1;
  }
  if (spos >= st->len) return -1;
  return maia_re_char_eq((unsigned char)st->str[spos], (unsigned char)c, st->icase) ? spos + 1 : -1;
}

static int maia_re_match_seq(const char* pat, int plen, int ppos, MaiaReState* st, int spos, const char* rest_pat, int rest_len) {
  if (ppos >= plen) {
    if (rest_pat && rest_len > 0) {
      return maia_re_match_seq(rest_pat, rest_len, 0, st, spos, 0, 0);
    }
    return spos;
  }

  /* Handle groups (...) / (?:...) */
  if (pat[ppos] == '(') {
    int grp_end = maia_re_find_group_end(pat, plen, ppos + 1);
    int inner_start = ppos + 1;
    int inner_end = (grp_end > ppos + 1 && pat[grp_end - 1] == ')') ? grp_end - 1 : grp_end;
    int cap_idx = -1;
    if (inner_start + 1 < inner_end && pat[inner_start] == '?' && pat[inner_start + 1] == ':') {
      inner_start += 2;
    } else if (st->num_caps < 16) {
      cap_idx = st->num_caps++;
    }
    int after_grp = grp_end;
    int min_q = 1, max_q = 1, lazy = 0;
    maia_re_parse_quant(pat, plen, &after_grp, &min_q, &max_q, &lazy);

    if (min_q == 1 && max_q == 1) {
      /* Single group match, try each alternative inside group with continuation */
      int i = inner_start;
      int alt_start = inner_start;
      int depth = 0;
      int in_cls = 0;
      while (i <= inner_end) {
        int is_end = (i == inner_end);
        char ch = is_end ? '|' : pat[i];
        if (!is_end && ch == '\\' && i + 1 < inner_end) { i += 2; continue; }
        if (!is_end && in_cls) { if (ch == ']') in_cls = 0; i++; continue; }
        if (!is_end && ch == '[') { in_cls = 1; i++; continue; }
        if (!is_end && ch == '(') { depth++; i++; continue; }
        if (!is_end && ch == ')') { depth--; i++; continue; }
        if (is_end || (ch == '|' && depth == 0)) {
          /* First match the alternative alone to record capture end, then continue */
          int end_inner = maia_re_match_seq(pat, i, alt_start, st, spos, 0, 0);
          if (end_inner >= 0) {
            if (cap_idx >= 0) {
              st->cap_start[cap_idx] = spos;
              st->cap_end[cap_idx] = end_inner;
            }
            int res = maia_re_match_seq(pat, plen, after_grp, st, end_inner, rest_pat, rest_len);
            if (res >= 0) return res;
          }
          alt_start = i + 1;
        }
        i++;
      }
      return -1;
    }
    /* Quantified group */
    if (min_q == 0) {
      if (lazy) {
        int res = maia_re_match_seq(pat, plen, after_grp, st, spos, rest_pat, rest_len);
        if (res >= 0) return res;
      }
      int end_inner = maia_re_match_alt(pat, inner_end, inner_start, st, spos, 0, 0);
      if (end_inner > spos) {
        if (cap_idx >= 0) { st->cap_start[cap_idx] = spos; st->cap_end[cap_idx] = end_inner; }
        /* Repeat or finish */
        int res = maia_re_match_seq(pat, plen, ppos, st, end_inner, rest_pat, rest_len);
        if (res >= 0) return res;
      }
      return maia_re_match_seq(pat, plen, after_grp, st, spos, rest_pat, rest_len);
    } else {
      int end_inner = maia_re_match_alt(pat, inner_end, inner_start, st, spos, 0, 0);
      if (end_inner < 0) return -1;
      if (cap_idx >= 0) { st->cap_start[cap_idx] = spos; st->cap_end[cap_idx] = end_inner; }
      return maia_re_match_seq(pat, plen, after_grp, st, end_inner, rest_pat, rest_len);
    }
  }

  /* Simple atom */
  int atom_start = ppos;
  int atom_end = ppos + 1;
  if (pat[ppos] == '\\' && ppos + 1 < plen) {
    unsigned char dummy_ch = 0;
    int dummy_cls = 0;
    atom_end = ppos + 1;
    maia_re_decode_escape(pat, plen, &atom_end, &dummy_ch, &dummy_cls);
  } else if (pat[ppos] == '[') {
    atom_end = maia_re_find_class_end(pat, plen, ppos);
  }

  int after_atom = atom_end;
  int min_q = 1, max_q = 1, lazy = 0;
  maia_re_parse_quant(pat, plen, &after_atom, &min_q, &max_q, &lazy);

  if (min_q == 1 && max_q == 1) {
    int next_s = maia_re_match_atom_once(pat, atom_start, atom_end, st, spos);
    if (next_s < 0) return -1;
    return maia_re_match_seq(pat, plen, after_atom, st, next_s, rest_pat, rest_len);
  }

  /* Collect greedy positions up to max_q */
  int count = 0;
  int cur = spos;
  /* Zero-width assertions don't advance */
  while (count < min_q) {
    int nxt = maia_re_match_atom_once(pat, atom_start, atom_end, st, cur);
    if (nxt < 0) return -1;
    cur = nxt;
    count++;
  }
  if (lazy) {
    while (1) {
      int res = maia_re_match_seq(pat, plen, after_atom, st, cur, rest_pat, rest_len);
      if (res >= 0) return res;
      if (count >= max_q) break;
      int nxt = maia_re_match_atom_once(pat, atom_start, atom_end, st, cur);
      if (nxt < 0 || nxt == cur) break;
      cur = nxt;
      count++;
    }
    return -1;
  }
  /* Greedy: advance as far as possible, then backtrack */
  int max_positions[256];
  int pos_count = 0;
  max_positions[pos_count++] = cur;
  while (count < max_q && pos_count < 256) {
    int nxt = maia_re_match_atom_once(pat, atom_start, atom_end, st, cur);
    if (nxt < 0 || nxt == cur) break;
    cur = nxt;
    count++;
    max_positions[pos_count++] = cur;
  }
  for (int k = pos_count - 1; k >= 0; k--) {
    int res = maia_re_match_seq(pat, plen, after_atom, st, max_positions[k], rest_pat, rest_len);
    if (res >= 0) return res;
  }
  return -1;
}

static int maia_re_match_alt(const char* pat, int plen, int ppos, MaiaReState* st, int spos, const char* rest_pat, int rest_len) {
  int i = ppos;
  int alt_start = ppos;
  int depth = 0;
  int in_cls = 0;
  while (i <= plen) {
    int is_end = (i == plen);
    char ch = is_end ? '|' : pat[i];
    if (!is_end && ch == '\\' && i + 1 < plen) { i += 2; continue; }
    if (!is_end && in_cls) { if (ch == ']') in_cls = 0; i++; continue; }
    if (!is_end && ch == '[') { in_cls = 1; i++; continue; }
    if (!is_end && ch == '(') { depth++; i++; continue; }
    if (!is_end && ch == ')') { depth--; i++; continue; }
    if (is_end || (ch == '|' && depth == 0)) {
      int saved_caps = st->num_caps;
      int res = maia_re_match_seq(pat, i, alt_start, st, spos, rest_pat, rest_len);
      if (res >= 0) return res;
      st->num_caps = saved_caps;
      alt_start = i + 1;
    }
    i++;
  }
  return -1;
}

static int maia_re_search_at(MaiaJsRegExp* re, const char* str, int start_pos, int* out_start, int* out_end, MaiaReState* out_st) {
  if (!re || !re->pattern || !str) return 0;
  int slen = (int)strlen(str);
  int plen = (int)strlen(re->pattern);
  int limit = re->flag_y ? start_pos : slen;
  for (int pos = start_pos; pos <= limit; pos++) {
    MaiaReState st;
    st.str = str;
    st.len = slen;
    st.icase = re->flag_i;
    st.multiline = re->flag_m;
    st.num_caps = 0;
    for (int k = 0; k < 16; k++) { st.cap_start[k] = -1; st.cap_end[k] = -1; }
    int end_pos = maia_re_match_alt(re->pattern, plen, 0, &st, pos, 0, 0);
    if (end_pos >= 0) {
      if (out_start) *out_start = pos;
      if (out_end) *out_end = end_pos;
      if (out_st) *out_st = st;
      return 1;
    }
  }
  return 0;
}

void* __maiaregex__new(const char* pattern, const char* flags) {
  MaiaJsRegExp* re = (MaiaJsRegExp*)maia_re_malloc(sizeof(MaiaJsRegExp));
  if (!re) return 0;
  int plen = pattern ? (int)strlen(pattern) : 0;
  re->pattern = (char*)maia_re_malloc((size_t)(plen + 1));
  if (re->pattern) {
    if (plen > 0) memcpy(re->pattern, pattern, (size_t)plen);
    re->pattern[plen] = '\0';
  }
  re->flag_g = 0;
  re->flag_i = 0;
  re->flag_m = 0;
  re->flag_y = 0;
  re->lastIndex = 0;
  if (flags) {
    for (int i = 0; flags[i] != '\0'; i++) {
      if (flags[i] == 'g') re->flag_g = 1;
      else if (flags[i] == 'i') re->flag_i = 1;
      else if (flags[i] == 'm') re->flag_m = 1;
      else if (flags[i] == 'y') re->flag_y = 1;
    }
  }
  return (void*)re;
}

int __maiaregex__test(void* re_ptr, const char* str) {
  MaiaJsRegExp* re = (MaiaJsRegExp*)re_ptr;
  if (!re || !str) return 0;
  int start_pos = (re->flag_g || re->flag_y) ? re->lastIndex : 0;
  int m_start = 0, m_end = 0;
  int ok = maia_re_search_at(re, str, start_pos, &m_start, &m_end, 0);
  if (re->flag_g || re->flag_y) {
    re->lastIndex = ok ? m_end : 0;
  }
  return ok;
}

const char* __maiaregex__replace(const char* str, void* re_ptr, const char* replacement) {
  if (!str) return "";
  MaiaJsRegExp* re = (MaiaJsRegExp*)re_ptr;
  const char* rep = replacement ? replacement : "";
  if (!re) return str;
  int slen = (int)strlen(str);
  int rlen = (int)strlen(rep);
  int cap = slen + rlen * 4 + 32;
  char* out = (char*)maia_re_malloc((size_t)cap);
  if (!out) return str;
  int out_len = 0;
  int pos = 0;
  while (pos <= slen) {
    int m_start = 0, m_end = 0;
    if (!maia_re_search_at(re, str, pos, &m_start, &m_end, 0)) {
      break;
    }
    int prefix_len = m_start - pos;
    int needed = out_len + prefix_len + rlen + 1;
    if (needed > cap) {
      int old_cap = cap;
      while (cap < needed) cap *= 2;
      char* grown = (char*)maia_re_realloc(out, (unsigned long)old_cap, (unsigned long)cap);
      if (!grown) { free(out); return str; }
      out = grown;
    }
    if (prefix_len > 0) {
      memcpy(out + out_len, str + pos, (size_t)prefix_len);
      out_len += prefix_len;
    }
    if (rlen > 0) {
      memcpy(out + out_len, rep, (size_t)rlen);
      out_len += rlen;
    }
    if (!re->flag_g) {
      pos = m_end;
      break;
    }
    if (m_end == pos) {
      if (pos < slen) {
        if (out_len + 2 > cap) {
          int old_cap = cap;
          cap *= 2;
          char* grown = (char*)maia_re_realloc(out, (unsigned long)old_cap, (unsigned long)cap);
          if (!grown) { free(out); return str; }
          out = grown;
        }
        out[out_len++] = str[pos++];
      } else {
        break;
      }
    } else {
      pos = m_end;
    }
  }
  int tail_len = slen - pos;
  if (tail_len > 0) {
    int needed = out_len + tail_len + 1;
    if (needed > cap) {
      int old_cap = cap;
      while (cap < needed) cap *= 2;
      char* grown = (char*)maia_re_realloc(out, (unsigned long)old_cap, (unsigned long)cap);
      if (!grown) { free(out); return str; }
      out = grown;
    }
    memcpy(out + out_len, str + pos, (size_t)tail_len);
    out_len += tail_len;
  }
  out[out_len] = '\0';
  return (const char*)out;
}

void* __maiaregex__match(const char* str, void* re_ptr) {
  MaiaJsRegExp* re = (MaiaJsRegExp*)re_ptr;
  if (!re || !str) return 0;
  int m_start = 0, m_end = 0;
  MaiaReState st;
  if (!maia_re_search_at(re, str, 0, &m_start, &m_end, &st)) {
    return 0;
  }
  int count = 1 + st.num_caps;
  __maia_runtime_value* arr = (__maia_runtime_value*)maia_re_malloc(sizeof(__maia_runtime_value));
  if (!arr) return 0;
  memset(arr, 0, sizeof(__maia_runtime_value));
  arr->tag = 2;
  arr->a = count;
  arr->capacity = count > 4 ? count : 4;
  arr->items = (long*)maia_re_malloc(sizeof(long) * (size_t)arr->capacity);
  if (!arr->items) { free(arr); return 0; }

  int full_len = m_end - m_start;
  char* full_str = (char*)maia_re_malloc((size_t)(full_len + 1));
  if (full_str) {
    if (full_len > 0) memcpy(full_str, str + m_start, (size_t)full_len);
    full_str[full_len] = '\0';
  }
  arr->items[0] = (long)full_str;
  for (int i = 0; i < st.num_caps; i++) {
    int cs = st.cap_start[i];
    int ce = st.cap_end[i];
    if (cs >= 0 && ce >= cs) {
      int clen = ce - cs;
      char* cstr = (char*)maia_re_malloc((size_t)(clen + 1));
      if (cstr) {
        if (clen > 0) memcpy(cstr, str + cs, (size_t)clen);
        cstr[clen] = '\0';
      }
      arr->items[i + 1] = (long)cstr;
    } else {
      arr->items[i + 1] = 0;
    }
  }
  return (void*)arr;
}

const char* __maia_array_join(void* arr_ptr, const char* sep) {
  __maia_runtime_value* arr = (__maia_runtime_value*)arr_ptr;
  if (!arr || arr->tag != 2 || arr->a <= 0 || !arr->items) return "";
  const char* s = sep ? sep : ",";
  int sep_len = (int)strlen(s);
  int total_len = 0;
  for (int i = 0; i < arr->a; i++) {
    const char* elem = (const char*)(arr->items[i]);
    if (elem) total_len += (int)strlen(elem);
    if (i > 0) total_len += sep_len;
  }
  char* out = (char*)maia_re_malloc((size_t)(total_len + 1));
  if (!out) return "";
  int pos = 0;
  for (int i = 0; i < arr->a; i++) {
    if (i > 0 && sep_len > 0) {
      memcpy(out + pos, s, (size_t)sep_len);
      pos += sep_len;
    }
    const char* elem = (const char*)(arr->items[i]);
    if (elem) {
      int elen = (int)strlen(elem);
      if (elen > 0) {
        memcpy(out + pos, elem, (size_t)elen);
        pos += elen;
      }
    }
  }
  out[pos] = '\0';
  return (const char*)out;
}

const char* __maia_str_slice(const char* str, int start, int hasEnd, int end) {
  if (!str) return "";
  int len = (int)strlen(str);
  if (start < 0) start = len + start;
  if (start < 0) start = 0;
  if (start > len) start = len;
  int e = hasEnd ? end : len;
  if (e < 0) e = len + e;
  if (e < 0) e = 0;
  if (e > len) e = len;
  if (e <= start) return "";
  int out_len = e - start;
  char* out = (char*)maia_re_malloc((size_t)(out_len + 1));
  if (!out) return "";
  memcpy(out, str + start, (size_t)out_len);
  out[out_len] = '\0';
  return (const char*)out;
}

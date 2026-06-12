#ifndef BLACKBOX_H
#define BLACKBOX_H

#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct ByteSlice {
  size_t ptr;
  uint32_t len;
} ByteSlice;

size_t bb_alloc(uint32_t len);

void bb_engine_free(uint32_t handle);

uint32_t bb_engine_new(size_t scenario_ptr,
                       uint32_t scenario_len,
                       size_t items_ptr,
                       uint32_t items_len,
                       size_t characters_ptr,
                       uint32_t characters_len,
                       size_t assets_ptr,
                       uint32_t assets_len,
                       size_t chapters_ptr,
                       uint32_t chapter_count,
                       size_t library_ptr,
                       uint32_t library_len,
                       bool has_random_seed_override,
                       uint64_t random_seed_override);

void bb_free(size_t ptr, uint32_t len);

int32_t bb_get_view(uint32_t handle, size_t out_ptr, uint32_t out_cap);

void bb_init(void);

int32_t bb_last_error(size_t out_ptr, uint32_t out_cap);

int32_t bb_load_catalog(uint32_t handle, size_t in_ptr, uint32_t in_len);

int32_t bb_load_chapter(uint32_t handle, size_t in_ptr, uint32_t in_len);

int32_t bb_load_library(uint32_t handle, size_t in_ptr, uint32_t in_len);

int32_t bb_restore(uint32_t handle,
                   size_t in_ptr,
                   uint32_t in_len,
                   size_t out_ptr,
                   uint32_t out_cap);

int32_t bb_serialize(uint32_t handle, size_t out_ptr, uint32_t out_cap);

int32_t bb_set_log_formatter(uint32_t format);

int32_t bb_set_log_level(uint32_t level);

int32_t bb_submit(uint32_t handle,
                  size_t in_ptr,
                  uint32_t in_len,
                  uint32_t view_revision,
                  size_t out_ptr,
                  uint32_t out_cap);

int32_t bb_unload_chapter(uint32_t handle, size_t in_ptr, uint32_t in_len);

#endif  /* BLACKBOX_H */

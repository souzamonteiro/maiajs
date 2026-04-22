(module
  ;; MaiaJS async exception/scheduler runtime module
  ;; Exports exception ABI compatible with MaiaCpp and async scheduler hooks.

  (memory (export "memory") 1)

  (global $exc_active (mut i32) (i32.const 0))
  (global $exc_type (mut i32) (i32.const 0))
  (global $exc_data (mut i32) (i32.const 0))
  (global $exc_depth (mut i32) (i32.const 0))

  ;; Async scheduler tracking for host-side orchestration/debugging.
  (global $async_pending (mut i32) (i32.const 0))
  (global $async_last_state (mut i32) (i32.const -1))
  (global $async_last_sm (mut i32) (i32.const 0))

  ;; ----------------------------------------------------------------------
  ;; Exception API
  ;; ----------------------------------------------------------------------
  (func $__exc_push (export "__exc_push")
    (global.set $exc_depth
      (i32.add (global.get $exc_depth) (i32.const 1)))
  )

  (func $__exc_pop (export "__exc_pop")
    (if (i32.gt_s (global.get $exc_depth) (i32.const 0))
      (then
        (global.set $exc_depth
          (i32.sub (global.get $exc_depth) (i32.const 1)))
      )
    )
  )

  (func $__exc_active (export "__exc_active") (result i32)
    (global.get $exc_active)
  )

  (func $__exc_type (export "__exc_type") (result i32)
    (global.get $exc_type)
  )

  (func $__exc_data (export "__exc_data") (result i32)
    (global.get $exc_data)
  )

  (func $__exc_throw (export "__exc_throw") (param $type i32) (param $data i32)
    (global.set $exc_type (local.get $type))
    (global.set $exc_data (local.get $data))
    (global.set $exc_active (i32.const 1))
  )

  (func $__exc_clear (export "__exc_clear")
    (global.set $exc_active (i32.const 0))
    (global.set $exc_type (i32.const 0))
    (global.set $exc_data (i32.const 0))
  )

  (func $__exc_matches (export "__exc_matches")
    (param $thrown_type i32)
    (param $catch_type i32)
    (result i32)
    (i32.eq (local.get $thrown_type) (local.get $catch_type))
  )

  ;; ----------------------------------------------------------------------
  ;; Async scheduler hooks
  ;; ----------------------------------------------------------------------
  (func $__async_schedule (export "__async_schedule") (param $sm i32) (param $state_id i32)
    (global.set $async_last_sm (local.get $sm))
    (global.set $async_last_state (local.get $state_id))
    (global.set $async_pending
      (i32.add (global.get $async_pending) (i32.const 1)))
  )

  (func $__async_complete (export "__async_complete") (param $sm i32)
    (global.set $async_last_sm (local.get $sm))
    (if (i32.gt_s (global.get $async_pending) (i32.const 0))
      (then
        (global.set $async_pending
          (i32.sub (global.get $async_pending) (i32.const 1)))
      )
    )
  )

  ;; Optional diagnostics for host runtimes.
  (func $__async_pending_count (export "__async_pending_count") (result i32)
    (global.get $async_pending)
  )

  (func $__async_last_state (export "__async_last_state") (result i32)
    (global.get $async_last_state)
  )
)

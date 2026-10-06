# Notes and reflections — 2026-10-05

## Self-play pretraining with zero data

Pseudocode for the paper, from a [gist shared by Mukund](https://gist.github.com/maujim/97e526d7570e5ae54dedb393ec0d563a).

```text
self_play_pretrain()                         # no external training corpus
├─ learner = random_init_transformer()
├─ generator = random_init_transformer()
└─ for round e:
   ├─ build_program_pool()
   │  ├─ sample_fresh_programs(generator)
   │  ├─ mutate_previously_rewarded_programs()
   │  └─ replay_previous_programs()
   │
   ├─ for each program x:
   │  ├─ y = execute_brainfuck(x, random_input_tape)
   │  │  └─ emit_bytes_or_zero_pad_within_resource_limits()
   │  ├─ loss = learner.next_byte_cross_entropy(y)
   │  └─ reward = measure_gradient_alignment()
   │     ├─ gradient = ∇θ loss
   │     ├─ trajectory = θ[floor(e/2)] − θ[e]
   │     ├─ preconditioner = lr / (sqrt(adam_v_hat) + ε)
   │     └─ return abs(dot(gradient, preconditioner * trajectory))
   │
   ├─ update_learner()
   │  └─ adamw_step(mean_cross_entropy_over_pool)
   │
   ├─ update_generator()
   │  ├─ normalize_rewards_into_advantages()
   │  ├─ penalize_departure_from_uniform_program_prior()
   │  ├─ policy_gradient_step(fresh + importance_corrected_replay)
   │  └─ reward_weighted_supervised_step(entire_pool)
   │
   └─ update_program_bank_and_learner_checkpoints()

evaluate_learner()                           # measurement only; no updates
├─ score_held_out_natural_bytes()
└─ test_in_context_learning()
```

## Reflection

The core recursion, conceptually: **the generator learns what to teach by watching how the learner learns.** The actual training loop is iterative, not a recursive function call.

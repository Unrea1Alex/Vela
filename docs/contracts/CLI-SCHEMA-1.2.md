# Typed CLI schema (1.2.4)

Accepted before implementation. New opt-in std/cli_schema.vela leaves cli.vela
and all its public types/parse behavior unchanged. Parameter descriptors are
opaque, made by flag(name,help,default), text(name,help,Option<String> default),
integer(name,help,min,max,Option<Int> default), positional(name,help,default).
None means required, Some supplies the default (including empty text).
Flags accept presence, not a textual boolean. Positional parameters are text;
required ones precede optional ones. Long options may occur between positionals.

create(program,description,parameters,relations) validates and snapshots a schema:
nonempty ASCII option names, unique names (help reserved), at most 64 descriptors
and 64 relations, valid integer/default ranges, positional ordering. less_equal
relations must name two integer options. Invalid schemas reject before reading
args or doing I/O. Descriptor/default values are immutable ordinary value copies.

parse(values,schema) has state only, at most 4096 argument strings; current(schema)
adds args. Underlying cli::parse supplies unchanged lexical rules: --name=value,
--name value, -- stops options, empty text accepted, negative integers consumed,
unknown/repeated flags/missing values rejected. Invalid/overflowing Int spelling
and values outside inclusive bounds reject. Extra/missing positionals reject.
Relations check resolved explicit/default integer values. Input lists are never
mutated; results use private storage. No callback, I/O or global state is involved.

Arguments is opaque. flag_value/text_value/int_value return typed Results and
reject missing names or mismatched descriptor types; there are no unchecked
public casts. is_help and help expose a deterministic usage/descriptor listing.
--help validates lexical errors/schema but bypasses value conversion/required/range-relation
validation; it returns no usable parameter values. Callers inspect is_help first.
Apps print help to stdout/exit 0 before I/O, argument errors to stderr/exit 2.
The library itself prints nothing and selects no process exit code.

Error preserves old cli::Error as a typed cause and adds schema, required/count,
integer/range/relation, type/name lookup and system categories. describe formats
a stable human explanation without discarding the stored typed cause. effects
and ordinary tracing/aliasing follow 1.2.1a; no ownership/ABI extension occurs.

Acceptance: all descriptor kinds/defaults/required values/help; unknown/duplicate,
--, empty text, negative/boundary/overflow Int, missing values and min/max errors;
schema errors and typed lookup errors; input alias preservation, wrong type/effect
rejections. Three migrated apps retain the frozen 26/46/44 functional oracles;
app errors/help are deterministic, original cli compatibility and native verify pass.

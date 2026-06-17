// Package schema provides runtime JSON-Schema validation of OCPI payloads. A
// version package (e.g. v221) embeds a generated JSON-Schema document whose
// $defs hold every OCPI type; Validator compiles it and validates raw JSON
// against a named type.
package schema

import (
	"bytes"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

const docURL = "https://gocpi.local/schema.json"

// Validator validates raw JSON against named OCPI type schemas.
type Validator struct {
	compiled map[string]*jsonschema.Schema
}

// New compiles a JSON-Schema document whose top-level "$defs" maps type names to
// schemas, and returns a Validator keyed by those names.
func New(doc []byte) (*Validator, error) {
	root, err := jsonschema.UnmarshalJSON(bytes.NewReader(doc))
	if err != nil {
		return nil, fmt.Errorf("schema: parse document: %w", err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource(docURL, root); err != nil {
		return nil, fmt.Errorf("schema: add resource: %w", err)
	}

	rootMap, _ := root.(map[string]any)
	defs, _ := rootMap["$defs"].(map[string]any)
	v := &Validator{compiled: make(map[string]*jsonschema.Schema, len(defs))}
	for name := range defs {
		sch, err := c.Compile(docURL + "#/$defs/" + name)
		if err != nil {
			return nil, fmt.Errorf("schema: compile %s: %w", name, err)
		}
		v.compiled[name] = sch
	}
	return v, nil
}

// Validate checks raw JSON data against the named type's schema. It returns an
// error describing the first failures, or nil when data is valid.
func (v *Validator) Validate(typeName string, data []byte) error {
	sch, ok := v.compiled[typeName]
	if !ok {
		return fmt.Errorf("schema: unknown type %q", typeName)
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("schema: parse instance: %w", err)
	}
	return sch.Validate(inst)
}

// Types returns the names of all validatable types.
func (v *Validator) Types() []string {
	names := make([]string, 0, len(v.compiled))
	for n := range v.compiled {
		names = append(names, n)
	}
	return names
}

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// config mirrors the parts of a version's config.json the generator needs.
type config struct {
	Modules map[string]struct {
		Interfaces []string `json:"interfaces"`
	} `json:"modules"`
	Roles map[string][]string `json:"roles"`

	names []string // module names, sorted for stable iteration
}

func loadConfig(schemasDir string) *config {
	data, err := os.ReadFile(filepath.Join(schemasDir, "config.json"))
	if err != nil {
		fatal(err)
	}
	var c config
	if err := json.Unmarshal(data, &c); err != nil {
		fatal(fmt.Errorf("parse config.json: %w", err))
	}
	for name := range c.Modules {
		c.names = append(c.names, name)
	}
	sort.Strings(c.names)
	return &c
}

// typeModules lists the schema files to generate Go types from: the shared
// components plus each module's schema.yaml.
func (c *config) typeModules() []moduleGen {
	mods := []moduleGen{{File: "components", Schema: "components/schema.yaml"}}
	for _, name := range c.names {
		mods = append(mods, moduleGen{File: name, Schema: "modules/" + name + "/schema.yaml"})
	}
	return mods
}

// apiModules lists the (module, interface) pairs to generate typed clients and
// server handlers for: every module exposing a sender or receiver interface.
// Configuration modules (a plain "interface", e.g. versions/credentials) are
// handled by the handshake package and skipped here.
func (c *config) apiModules() []apiModuleGen {
	var out []apiModuleGen
	for _, name := range c.names {
		for _, iface := range c.Modules[name].Interfaces {
			switch iface {
			case "sender-interface":
				out = append(out, apiModuleGen{Module: name, Iface: "sender", Schema: "modules/" + name + "/sender-interface.yaml"})
			case "receiver-interface":
				out = append(out, apiModuleGen{Module: name, Iface: "receiver", Schema: "modules/" + name + "/receiver-interface.yaml"})
			}
		}
	}
	return out
}

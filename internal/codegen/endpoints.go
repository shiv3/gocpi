package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// apiModuleGen describes one interface (sender/receiver) of a module for which a
// typed client and server handler interface are generated.
type apiModuleGen struct {
	Module string // e.g. "locations"
	Iface  string // "sender" or "receiver"
	Schema string // interface YAML path relative to schemas/<version>
}

// generateAPI emits the client + server handler code for every module exposing a
// sender or receiver interface (per config.json).
func generateAPI(schemasDir, pkg string, cfg *config) {
	for _, am := range cfg.apiModules() {
		ops, err := parseInterface(filepath.Join(schemasDir, am.Schema))
		if err != nil {
			fatal(err)
		}
		if len(ops) == 0 {
			continue
		}
		ag := &apiGen{pkg: pkg}
		src := ag.emit(am.Module, am.Iface, ops)
		out := filepath.Join(pkg, am.Module+"_"+am.Iface+".go")
		writeGoFile(out, src)
		fmt.Printf("generated %s\n", out)
	}
}

// ---- interface parsing ----

type operation struct {
	ID         string
	Method     string // http.Method* constant expression
	StripPath  string // path with the module-prefix segment removed ("" or "/{x}/...")
	PathParams []string
	Paginated  bool
	ReqType    string // request body type ("" if none)
	RespType   string // response data type ("" if none)
	RespList   bool   // response data is a list
}

var pathParamRe = regexp.MustCompile(`\{([^}]+)\}`)

func parseInterface(path string) ([]operation, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var root yaml.Node
	if err := yaml.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if len(root.Content) == 0 {
		return nil, nil
	}
	paths := mapGet(root.Content[0], "paths")
	if paths == nil {
		return nil, nil
	}
	var ops []operation
	for i := 0; i+1 < len(paths.Content); i += 2 {
		rawPath := paths.Content[i].Value
		methods := paths.Content[i+1]
		strip := stripModulePrefix(rawPath)
		params := pathParams(rawPath)
		for j := 0; j+1 < len(methods.Content); j += 2 {
			m := strings.ToLower(methods.Content[j].Value)
			httpConst, ok := httpMethodConst(m)
			if !ok {
				continue
			}
			opNode := methods.Content[j+1]
			op := operation{
				ID:         mapGetVal(opNode, "operationId"),
				Method:     httpConst,
				StripPath:  strip,
				PathParams: params,
				Paginated:  hasPaginationParams(mapGet(opNode, "parameters")),
				ReqType:    reqBodyType(opNode),
			}
			op.RespType, op.RespList = respDataType(opNode)
			ops = append(ops, op)
		}
	}
	return ops, nil
}

func stripModulePrefix(p string) string {
	segs := strings.Split(strings.Trim(p, "/"), "/")
	if len(segs) <= 1 {
		return ""
	}
	return "/" + strings.Join(segs[1:], "/")
}

func pathParams(p string) []string {
	var out []string
	for _, m := range pathParamRe.FindAllStringSubmatch(p, -1) {
		out = append(out, m[1])
	}
	return out
}

func httpMethodConst(m string) (string, bool) {
	switch m {
	case "get":
		return "http.MethodGet", true
	case "put":
		return "http.MethodPut", true
	case "patch":
		return "http.MethodPatch", true
	case "post":
		return "http.MethodPost", true
	case "delete":
		return "http.MethodDelete", true
	}
	return "", false
}

func mapGetVal(n *yaml.Node, key string) string {
	if v := mapGet(n, key); v != nil {
		return v.Value
	}
	return ""
}

func hasPaginationParams(seq *yaml.Node) bool {
	if seq == nil {
		return false
	}
	for _, item := range seq.Content {
		ref := mapGetVal(item, "$ref")
		if strings.Contains(ref, "LimitParameter") || strings.Contains(ref, "OffsetParameter") {
			return true
		}
	}
	return false
}

func reqBodyType(opNode *yaml.Node) string {
	rb := mapGet(opNode, "requestBody")
	if rb == nil {
		return ""
	}
	if sch := schemaOfContent(mapGet(rb, "content")); sch != nil {
		return refName(mapGetVal(sch, "$ref"))
	}
	return ""
}

func schemaOfContent(content *yaml.Node) *yaml.Node {
	if content == nil {
		return nil
	}
	if aj := mapGet(content, "application/json"); aj != nil {
		return mapGet(aj, "schema")
	}
	return nil
}

func respDataType(opNode *yaml.Node) (string, bool) {
	resps := mapGet(opNode, "responses")
	if resps == nil {
		return "", false
	}
	for _, code := range []string{"200", "201"} {
		r := mapGet(resps, code)
		if r == nil || mapGetVal(r, "$ref") != "" {
			continue // missing, or a response component (no data)
		}
		sch := schemaOfContent(mapGet(r, "content"))
		if sch == nil {
			continue
		}
		allOf := mapGet(sch, "allOf")
		if allOf == nil {
			continue
		}
		for _, item := range allOf.Content {
			data := mapGet(mapGet(item, "properties"), "data")
			if data == nil {
				continue
			}
			if mapGetVal(data, "type") == "array" {
				return refName(mapGetVal(mapGet(data, "items"), "$ref")), true
			}
			if ref := mapGetVal(data, "$ref"); ref != "" {
				return refName(ref), false
			}
		}
	}
	return "", false
}

// ---- emission ----

type apiGen struct {
	pkg          string
	needsURL     bool
	needsJSON    bool
	needsStrconv bool
}

func (g *apiGen) emit(mod, iface string, ops []operation) []byte {
	clientT := pascalWord(mod) + pascalWord(iface) + "Client"
	handlerT := pascalWord(mod) + pascalWord(iface) + "Handler"
	regFn := "Register" + pascalWord(mod) + pascalWord(iface)

	// Register normalizes basePath through url.Parse, so net/url is always used.
	g.needsURL = true

	var b bytes.Buffer

	fmt.Fprintf(&b, "// %s calls the %s %s interface on a peer.\n", clientT, pascalWord(mod), iface)
	fmt.Fprintf(&b, "type %s struct {\n\tc    *core.Client\n\tbase string\n}\n\n", clientT)
	fmt.Fprintf(&b, "// New%s binds a client to baseURL (the peer's %s endpoint URL).\n", clientT, mod)
	fmt.Fprintf(&b, "func New%s(c *core.Client, baseURL string) *%s {\n\treturn &%s{c: c, base: strings.TrimRight(baseURL, \"/\")}\n}\n\n", clientT, clientT, clientT)
	for _, op := range ops {
		g.emitClientMethod(&b, clientT, op)
	}

	fmt.Fprintf(&b, "// %s handles inbound %s %s requests.\n", handlerT, pascalWord(mod), iface)
	fmt.Fprintf(&b, "type %s interface {\n", handlerT)
	for _, op := range ops {
		fmt.Fprintf(&b, "\t%s\n", g.handlerSig(op))
	}
	b.WriteString("}\n\n")

	fmt.Fprintf(&b, "// %s registers h's routes on mux under basePath (the module mount path).\n", regFn)
	fmt.Fprintf(&b, "func %s(mux *core.Mux, basePath string, h %s) {\n", regFn, handlerT)
	b.WriteString("\t// basePath may be a full URL or a path; routes use its path.\n")
	b.WriteString("\tbu, _ := url.Parse(basePath)\n")
	b.WriteString("\tbase := strings.TrimRight(bu.Path, \"/\")\n")
	for _, op := range ops {
		g.emitRoute(&b, op)
	}
	b.WriteString("}\n")

	var hdr bytes.Buffer
	hdr.WriteString("// Code generated by gocpi codegen. DO NOT EDIT.\n\n")
	fmt.Fprintf(&hdr, "package %s\n\n", g.pkg)
	hdr.WriteString("import (\n\t\"context\"\n")
	if g.needsJSON {
		hdr.WriteString("\t\"encoding/json\"\n")
	}
	hdr.WriteString("\t\"net/http\"\n")
	if g.needsURL {
		hdr.WriteString("\t\"net/url\"\n")
	}
	if g.needsStrconv {
		hdr.WriteString("\t\"strconv\"\n")
	}
	hdr.WriteString("\t\"strings\"\n\n")
	hdr.WriteString("\t\"github.com/shiv3/gocpi/core\"\n")
	hdr.WriteString("\t\"github.com/shiv3/gocpi/core/status\"\n)\n\n")
	return append(hdr.Bytes(), b.Bytes()...)
}

func (g *apiGen) emitClientMethod(b *bytes.Buffer, clientT string, op operation) {
	name := methodName(op.ID)
	fmt.Fprintf(b, "func (x *%s) %s(%s) %s {\n", clientT, name, g.clientArgs(op), g.clientRet(op))
	g.emitURLBuild(b, op)
	if op.Paginated {
		b.WriteString("\tif q := p.Query().Encode(); q != \"\" {\n\t\tu += \"?\" + q\n\t}\n")
	}
	bodyArg := "nil"
	if op.ReqType != "" {
		bodyArg = "body"
	}
	fmt.Fprintf(b, "\tresp, err := x.c.Do(ctx, %s, u, %s)\n", op.Method, bodyArg)
	switch {
	case op.RespList:
		fmt.Fprintf(b, "\tif err != nil {\n\t\treturn core.Page[%s]{}, err\n\t}\n", op.RespType)
		fmt.Fprintf(b, "\tout, err := core.Decode[[]%s](resp)\n\tif err != nil {\n\t\treturn core.Page[%s]{}, err\n\t}\n", op.RespType, op.RespType)
		b.WriteString("\ttotal, limit, next := core.ParsePageHeaders(resp.Header)\n")
		fmt.Fprintf(b, "\treturn core.Page[%s]{Items: out.Data, TotalCount: total, Limit: limit, NextURL: next}, nil\n", op.RespType)
	case op.RespType != "":
		fmt.Fprintf(b, "\tif err != nil {\n\t\tvar zero %s\n\t\treturn zero, err\n\t}\n", op.RespType)
		fmt.Fprintf(b, "\tout, err := core.Decode[%s](resp)\n\treturn out.Data, err\n", op.RespType)
	default:
		b.WriteString("\tif err != nil {\n\t\treturn err\n\t}\n")
		b.WriteString("\t_, err = core.Decode[any](resp)\n\treturn err\n")
	}
	b.WriteString("}\n\n")
}

func (g *apiGen) clientArgs(op operation) string {
	parts := []string{"ctx context.Context"}
	for _, p := range op.PathParams {
		parts = append(parts, goArgName(p)+" string")
	}
	if op.Paginated {
		parts = append(parts, "p core.PageOpts")
	}
	if op.ReqType != "" {
		parts = append(parts, "body "+op.ReqType)
	}
	return strings.Join(parts, ", ")
}

func (g *apiGen) clientRet(op operation) string {
	switch {
	case op.RespList:
		return "(core.Page[" + op.RespType + "], error)"
	case op.RespType != "":
		return "(" + op.RespType + ", error)"
	default:
		return "error"
	}
}

func (g *apiGen) emitURLBuild(b *bytes.Buffer, op operation) {
	if op.StripPath == "" {
		b.WriteString("\tu := x.base\n")
		return
	}
	expr := "x.base"
	for _, s := range strings.Split(strings.Trim(op.StripPath, "/"), "/") {
		if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
			g.needsURL = true
			expr += ` + "/" + url.PathEscape(` + goArgName(s[1:len(s)-1]) + ")"
		} else {
			expr += ` + "/" + ` + fmt.Sprintf("%q", s)
		}
	}
	fmt.Fprintf(b, "\tu := %s\n", expr)
}

func (g *apiGen) handlerSig(op operation) string {
	parts := []string{"ctx context.Context"}
	for _, p := range op.PathParams {
		parts = append(parts, goArgName(p)+" string")
	}
	if op.Paginated {
		parts = append(parts, "req core.PageReq")
	}
	if op.ReqType != "" {
		parts = append(parts, "body "+op.ReqType)
	}
	var ret string
	switch {
	case op.RespList:
		ret = "(core.Page[" + op.RespType + "], *status.Error)"
	case op.RespType != "":
		ret = "(" + op.RespType + ", *status.Error)"
	default:
		ret = "*status.Error"
	}
	return fmt.Sprintf("%s(%s) %s", methodName(op.ID), strings.Join(parts, ", "), ret)
}

func (g *apiGen) emitRoute(b *bytes.Buffer, op operation) {
	name := methodName(op.ID)
	pattern := "base"
	if op.StripPath != "" {
		pattern = "base + " + fmt.Sprintf("%q", op.StripPath)
	}
	fmt.Fprintf(b, "\tmux.Handle(%s, %s, func(w http.ResponseWriter, r *http.Request) {\n", op.Method, pattern)

	callArgs := []string{"r.Context()"}
	for _, p := range op.PathParams {
		callArgs = append(callArgs, fmt.Sprintf("r.PathValue(%q)", p))
	}
	if op.Paginated {
		b.WriteString("\t\treq, perr := core.ParsePageReq(r.URL.Query())\n")
		b.WriteString("\t\tif perr != nil {\n\t\t\t_ = core.WriteError(w, status.GenericClient(perr.Error()))\n\t\t\treturn\n\t\t}\n")
		callArgs = append(callArgs, "req")
	}
	if op.ReqType != "" {
		g.needsJSON = true
		fmt.Fprintf(b, "\t\tvar body %s\n", op.ReqType)
		b.WriteString("\t\tif err := json.NewDecoder(r.Body).Decode(&body); err != nil {\n\t\t\t_ = core.WriteError(w, status.GenericClient(\"invalid request body\"))\n\t\t\treturn\n\t\t}\n")
		callArgs = append(callArgs, "body")
	}
	call := fmt.Sprintf("h.%s(%s)", name, strings.Join(callArgs, ", "))

	switch {
	case op.RespList:
		g.needsStrconv = true
		fmt.Fprintf(b, "\t\tpage, herr := %s\n", call)
		b.WriteString("\t\tif herr != nil {\n\t\t\t_ = core.WriteError(w, herr)\n\t\t\treturn\n\t\t}\n")
		b.WriteString("\t\tw.Header().Set(\"X-Total-Count\", strconv.Itoa(page.TotalCount))\n")
		b.WriteString("\t\tif page.Limit > 0 {\n\t\t\tw.Header().Set(\"X-Limit\", strconv.Itoa(page.Limit))\n\t\t}\n")
		b.WriteString("\t\tif page.NextURL != \"\" {\n\t\t\tw.Header().Set(\"Link\", \"<\"+page.NextURL+\">; rel=\\\"next\\\"\")\n\t\t}\n")
		b.WriteString("\t\t_ = core.WriteResponse(w, http.StatusOK, page.Items, status.Success, \"\")\n")
	case op.RespType != "":
		fmt.Fprintf(b, "\t\tdata, herr := %s\n", call)
		b.WriteString("\t\tif herr != nil {\n\t\t\t_ = core.WriteError(w, herr)\n\t\t\treturn\n\t\t}\n")
		b.WriteString("\t\t_ = core.WriteResponse(w, http.StatusOK, data, status.Success, \"\")\n")
	default:
		fmt.Fprintf(b, "\t\tif herr := %s; herr != nil {\n\t\t\t_ = core.WriteError(w, herr)\n\t\t\treturn\n\t\t}\n", call)
		b.WriteString("\t\t_ = core.WriteResponse(w, http.StatusOK, struct{}{}, status.Success, \"\")\n")
	}
	b.WriteString("\t})\n")
}

// methodName turns an operationId like "senderGetLocations" into "GetLocations".
func methodName(opID string) string {
	n := opID
	low := strings.ToLower(n)
	for _, pre := range []string{"sender", "receiver"} {
		if strings.HasPrefix(low, pre) {
			n = n[len(pre):]
			break
		}
	}
	if n == "" {
		return "Do"
	}
	return strings.ToUpper(n[:1]) + n[1:]
}

// goArgName turns a snake_case path param into a camelCase Go argument name.
func goArgName(snake string) string {
	f := goFieldName(snake)
	if f == "" {
		return "arg"
	}
	return strings.ToLower(f[:1]) + f[1:]
}

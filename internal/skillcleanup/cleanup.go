// Copyright (c) 2026 Devrecated.
// Archive repo copies of plugin-root skills and slash commands.
package skillcleanup

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const consumerSkills = "autodevelop"

// Move is one path relocated into the archive directory.
type Move struct {
	From string
	To   string
	Rel  string
}

// Plan is what a yes answer will archive. Empty means there is nothing to ask.
type Plan struct {
	Root       string
	ArchiveDir string
	Moves      []Move
	Keep       []string
}

// HasPluginRoot reports a checkout whose plugin already loads kits/cursor.
func HasPluginRoot(root string) bool {
	st, err := os.Stat(filepath.Join(root, "kits", "cursor", "commands"))
	return err == nil && st.IsDir()
}

// Build lists repo copies that match the plugin root. Client folders and
// autodevelop-internal stay. A repo without kits/cursor has nothing to archive.
func Build(root string, now time.Time) (Plan, error) {
	plan := Plan{Root: root}
	if !HasPluginRoot(root) {
		return plan, nil
	}
	stamp := now.UTC().Format("20060102T150405Z")
	archive := filepath.Join(root, ".autodevelop", "archive", stamp)
	plan.ArchiveDir = archive

	cmdDir := filepath.Join(root, ".cursor", "commands")
	kitCmds := filepath.Join(root, "kits", "cursor", "commands")
	entries, err := os.ReadDir(cmdDir)
	if err != nil && !os.IsNotExist(err) {
		return plan, err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		kitPath := filepath.Join(kitCmds, name)
		if st, err := os.Stat(kitPath); err != nil || st.IsDir() {
			rel := filepath.Join(".cursor", "commands", name)
			plan.Keep = append(plan.Keep, filepath.ToSlash(rel))
			continue
		}
		from := filepath.Join(cmdDir, name)
		rel := filepath.Join(".cursor", "commands", name)
		plan.Moves = append(plan.Moves, Move{
			From: from,
			To:   filepath.Join(archive, "commands", name),
			Rel:  filepath.ToSlash(rel),
		})
	}

	skillFrom := filepath.Join(root, ".cursor", "skills", consumerSkills)
	skillKit := filepath.Join(root, "kits", "cursor", "skills", consumerSkills)
	if st, err := os.Stat(skillFrom); err == nil && st.IsDir() {
		if kitSt, err := os.Stat(skillKit); err == nil && kitSt.IsDir() {
			rel := filepath.Join(".cursor", "skills", consumerSkills)
			plan.Moves = append(plan.Moves, Move{
				From: skillFrom,
				To:   filepath.Join(archive, "skills", consumerSkills),
				Rel:  filepath.ToSlash(rel) + "/",
			})
		}
	}
	skillsRoot := filepath.Join(root, ".cursor", "skills")
	skillEntries, err := os.ReadDir(skillsRoot)
	if err != nil && !os.IsNotExist(err) {
		return plan, err
	}
	for _, entry := range skillEntries {
		if !entry.IsDir() || entry.Name() == consumerSkills {
			continue
		}
		rel := filepath.Join(".cursor", "skills", entry.Name())
		plan.Keep = append(plan.Keep, filepath.ToSlash(rel)+"/")
	}
	return plan, nil
}

// Format is the prompt body, without the y/n question.
func Format(plan Plan) string {
	if len(plan.Moves) == 0 {
		return ""
	}
	relArchive, err := filepath.Rel(plan.Root, plan.ArchiveDir)
	if err != nil {
		relArchive = plan.ArchiveDir
	}
	var b strings.Builder
	b.WriteString("Skill cleanup\n\n")
	b.WriteString("These repo copies match the Autodevelop plugin at kits/cursor.\n")
	fmt.Fprintf(&b, "Yes moves them to %s/:\n\n", filepath.ToSlash(relArchive))
	for _, m := range plan.Moves {
		fmt.Fprintf(&b, "  %s\n", m.Rel)
	}
	if len(plan.Keep) > 0 {
		b.WriteString("\nStaying in the repo:\n\n")
		for _, rel := range plan.Keep {
			fmt.Fprintf(&b, "  %s\n", rel)
		}
	}
	return b.String()
}

// Apply moves every planned path. It does not prompt.
func Apply(plan Plan) error {
	for _, m := range plan.Moves {
		if err := os.MkdirAll(filepath.Dir(m.To), 0o755); err != nil {
			return err
		}
		if err := os.Rename(m.From, m.To); err != nil {
			return err
		}
	}
	return nil
}

// Offer prints the plan and archives on y. No plugin root, or nothing to move, is a no-op.
func Offer(root string, in io.Reader, out io.Writer, now time.Time) error {
	if in == nil {
		in = os.Stdin
	}
	if out == nil {
		out = os.Stdout
	}
	plan, err := Build(root, now)
	if err != nil {
		return err
	}
	if len(plan.Moves) == 0 {
		return nil
	}
	fmt.Fprint(out, Format(plan))
	fmt.Fprint(out, "\nSkill cleanup? [y/n] ")
	answer, err := readYesNo(in, out)
	if err != nil {
		return err
	}
	if !answer {
		fmt.Fprint(out, "Left repo copies in place.\n")
		return nil
	}
	if err := Apply(plan); err != nil {
		return err
	}
	relArchive, err := filepath.Rel(plan.Root, plan.ArchiveDir)
	if err != nil {
		relArchive = plan.ArchiveDir
	}
	fmt.Fprintf(out, "Archived %d paths to %s/\n", len(plan.Moves), filepath.ToSlash(relArchive))
	return nil
}

func readYesNo(in io.Reader, out io.Writer) (bool, error) {
	reader := bufio.NewReader(in)
	for {
		line, err := reader.ReadString('\n')
		if err != nil && line == "" {
			return false, err
		}
		switch strings.ToLower(strings.TrimSpace(line)) {
		case "y", "yes":
			return true, nil
		case "n", "no":
			return false, nil
		default:
			fmt.Fprint(out, "Skill cleanup? [y/n] ")
		}
		if err != nil {
			return false, err
		}
	}
}

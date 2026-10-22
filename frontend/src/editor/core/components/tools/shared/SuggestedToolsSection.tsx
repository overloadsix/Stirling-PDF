import React from "react";
import { Stack, Text, Divider, Card, Group, Anchor } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSuggestedTools } from "@app/hooks/useSuggestedTools";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import {
  selectDesktopNode,
  useDesktopActiveSelection,
} from "@app/hooks/useDesktopSelection";

export function SuggestedToolsSection(): React.ReactElement {
  const { t } = useTranslation();
  const activeSelection = useDesktopActiveSelection();
  const suggestedTools = useSuggestedTools();

  return (
    <Stack gap="md">
      <Divider />

      <Text size="lg" fw={600}>
        {t("editYourNewFiles", "Edit your new file(s)")}
      </Text>

      <Stack gap="xs">
        {suggestedTools.map((tool) => (
          <Anchor
            key={tool.id}
            href={tool.href}
            onClick={(event) => {
              event.preventDefault();
              selectDesktopNode({ kind: "tool", id: tool.id });
            }}
            onDoubleClick={tool.onClick}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.dispatchEvent(
                  new MouseEvent("dblclick", {
                    bubbles: true,
                    cancelable: true,
                  }),
                );
              }
            }}
            aria-current={
              activeSelection?.kind === "tool" && activeSelection.id === tool.id
                ? "true"
                : undefined
            }
            className={
              activeSelection?.kind === "tool" && activeSelection.id === tool.id
                ? "selected-file-node"
                : undefined
            }
            data-tour={`suggested-tool-${tool.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card p="sm" withBorder style={{ cursor: "pointer" }}>
              <Group gap="xs">
                <ToolIcon icon={tool.icon} />
                <Text size="sm" fw={500}>
                  {tool.title}
                </Text>
              </Group>
            </Card>
          </Anchor>
        ))}
      </Stack>
    </Stack>
  );
}

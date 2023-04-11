import React from "react";
import { ProcessedFile } from "./types";
import {
  AlertDialog,
  ForwardRef,
  Button,
  Overlay,
} from "@questdb/react-components";
import { Edit } from "styled-icons/remix-line";
import { Undo } from "styled-icons/boxicons-regular";

type Props = {
  open: boolean;
  onOpenChange: (openedFileName: string | undefined) => void;
  file: ProcessedFile;
};

export const RenameTableDialog = ({ open, onOpenChange, file }: Props) => {
  const name = file.table_name ?? file.fileObject.name;
  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Trigger asChild>
        <ForwardRef>
          <Button
            skin="transparent"
            prefixIcon={<Edit size="14px" />}
            onClick={() => onOpenChange(name)}
          >
            {name}
          </Button>
        </ForwardRef>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <ForwardRef>
          <Overlay primitive={AlertDialog.Overlay} />
        </ForwardRef>

        <AlertDialog.Content>
          <AlertDialog.Title>Rename table</AlertDialog.Title>

          <AlertDialog.Description>content</AlertDialog.Description>

          <AlertDialog.ActionButtons>
            <AlertDialog.Cancel asChild>
              <Button
                prefixIcon={<Undo size={18} />}
                skin="secondary"
                onClick={() => onOpenChange(undefined)}
              >
                Dismiss
              </Button>
            </AlertDialog.Cancel>

            <AlertDialog.Action asChild>
              <ForwardRef>
                <Button
                  prefixIcon={<Edit size={18} />}
                  skin="success"
                  onClick={() => onOpenChange(undefined)}
                >
                  Change
                </Button>
              </ForwardRef>
            </AlertDialog.Action>
          </AlertDialog.ActionButtons>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

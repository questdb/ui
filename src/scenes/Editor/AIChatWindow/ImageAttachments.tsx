import React from "react"
import styled from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import {
  Button,
  ButtonBase,
  Dialog,
  IconButton,
  Overlay,
} from "../../../components"
import type { AgentPromptImage } from "../../../utils/localAgent/protocol"

export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]
export const MAX_IMAGES = 4
// Base64 grows a file by a third; the bridge takes up to 7 MB of it.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const Strip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
`

const Thumb = styled.div<{ $size: number }>`
  position: relative;
  pointer-events: auto;
  width: ${({ $size }) => $size}rem;
  height: ${({ $size }) => $size}rem;
  flex-shrink: 0;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.6rem;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceInset};

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const Remove = styled(IconButton)`
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  opacity: 0;
  transition: opacity 120ms ease-out;
  background: ${({ theme }) => theme.color.surfaceRaised};

  ${Thumb}:hover &,
  ${Thumb}:focus-within &,
  &:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
`

// A sent image opens at full size, so a chart can be read.
const Enlarge = styled(ButtonBase)`
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
`

const Preview = styled(Dialog.Content)`
  && {
    width: auto;
    max-width: 90vw;
    padding: 0.8rem;
  }

  img {
    display: block;
    max-width: calc(90vw - 1.6rem);
    max-height: calc(85vh - 5.2rem);
    margin-inline: auto;
    border-radius: 0.4rem;
  }
`

const PreviewClose = styled(Button)`
  display: flex;
  margin: 0.8rem 0 0 auto;
`

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
`

export const imageSrc = (image: AgentPromptImage) =>
  `data:${image.mimeType};base64,${image.data}`

// Images attached to a message: in the composer, each can be removed; in the
// chat, they show above what the user wrote.
export const ImageAttachments = ({
  images,
  onRemove,
  size = 5.6,
}: {
  images: AgentPromptImage[]
  onRemove?: (index: number) => void
  size?: number
}) => (
  <Strip data-hook="chat-image-attachments">
    {images.map((image, index) => (
      // eslint-disable-next-line react/no-array-index-key -- images have no id and keep their order
      <Thumb key={index} $size={size}>
        {onRemove ? (
          <>
            <img src={imageSrc(image)} alt={`Attachment ${index + 1}`} />
            <Remove
              label={`Remove image ${index + 1}`}
              size="sm"
              variant="secondary"
              onClick={() => onRemove(index)}
              data-hook="chat-image-remove"
            >
              <XIcon size={12} />
            </Remove>
          </>
        ) : (
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Enlarge
                aria-label={`Open attachment ${index + 1} at full size`}
                data-hook="chat-image-enlarge"
              >
                <img src={imageSrc(image)} alt="" />
              </Enlarge>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Overlay primitive={Dialog.Overlay} />
              <Preview
                data-hook="chat-image-preview"
                aria-describedby={undefined}
              >
                <Dialog.Title asChild>
                  <VisuallyHidden>Attachment {index + 1}</VisuallyHidden>
                </Dialog.Title>
                <img src={imageSrc(image)} alt={`Attachment ${index + 1}`} />
                <Dialog.Close asChild>
                  <PreviewClose size="sm" variant="secondary">
                    Close
                  </PreviewClose>
                </Dialog.Close>
              </Preview>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </Thumb>
    ))}
  </Strip>
)

// Reads image files as attachments; the reason for any it cannot take.
export const readImages = async (
  files: File[],
  room: number,
): Promise<{ images: AgentPromptImage[]; error: string | null }> => {
  const images: AgentPromptImage[] = []
  let error: string | null = null
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) {
      error = "Attach PNG, JPEG, GIF or WebP images."
      continue
    }
    if (file.size > MAX_IMAGE_BYTES) {
      error = `${file.name || "The image"} is larger than 5 MB.`
      continue
    }
    if (images.length >= room) {
      error = `A message takes up to ${MAX_IMAGES} images.`
      break
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("unreadable"))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    images.push({
      mimeType: file.type,
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    })
  }
  return { images, error }
}

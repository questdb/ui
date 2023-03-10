import jQuery from "jquery"

export interface IQuestDBGrid {
    addEventListener(eventName: string, fn: (el: HTMLElement, a: any) => void);
}
export function grid(
  root: ReturnType<HTMLElement>,
  msgBus: ReturnType<typeof jQuery>,
  _gridID
): ReturnType<IQuestDBGrid>



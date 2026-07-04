import {
  createPriceItem,
  deletePriceItem,
  updatePriceItem,
} from "@/lib/actions";
import { getPriceItems } from "@/lib/prices";
import {
  PRICE_KIND,
  SUB_TYPE,
  formatMoney,
  type PriceKind,
  type SubType,
} from "@/lib/domain";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { IconPlus, IconX } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const prices = await getPriceItems();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Прайс"
        subtitle="Тарифы для новых абонементов, разовых и пробных занятий."
      />

      <section>
        <SectionTitle>Текущие тарифы</SectionTitle>
        <details className="mb-3">
          <summary className="ml-auto flex h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-full bg-brand-soft px-3.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-soft/70 [&::-webkit-details-marker]:hidden">
            <IconPlus className="size-4" />
            Добавить
          </summary>
          <Card className="mt-3 p-4">
            <PriceForm action={createPriceItem} submit="Добавить тариф" />
          </Card>
        </details>
        <Card className="divide-y divide-line overflow-hidden p-0">
          {prices.map((item) => (
            <details key={item.id} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-tint [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-ink sm:text-base">
                    {compactTitle(item)}
                  </p>
                </div>
                {!item.active && <Badge tone="slate">Скрыт</Badge>}
                <span className="shrink-0 text-xs font-semibold text-brand-dark">
                  Изменить
                </span>
              </summary>
              <div className="border-t border-line bg-white/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Редактирование</p>
                  <form action={deletePriceItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      aria-label="Удалить тариф"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted/50 hover:bg-red-50 hover:text-red-500"
                    >
                      <IconX className="size-4" />
                    </button>
                  </form>
                </div>
                <PriceForm
                  action={updatePriceItem}
                  item={item}
                  submit="Сохранить"
                />
              </div>
            </details>
          ))}
        </Card>
      </section>
    </div>
  );
}

function compactTitle(item: {
  name: string;
  kind: string;
  type: string;
  price: number;
  minLessons: number | null;
}) {
  const kind = PRICE_KIND[item.kind as PriceKind]?.label.toLowerCase() ?? item.kind;
  const type = SUB_TYPE[item.type as SubType]?.label.toLowerCase() ?? item.type;
  const lessons =
    item.kind === "subscription" && item.minLessons
      ? ` от ${item.minLessons} занятий`
      : "";
  return `${item.name}, ${kind} ${type}, ${formatMoney(item.price)}${lessons}`;
}

function PriceForm({
  action,
  item,
  submit,
}: {
  action: (fd: FormData) => Promise<void>;
  item?: {
    id: number;
    name: string;
    kind: string;
    type: string;
    price: number;
    minLessons: number | null;
    active: boolean;
    sortOrder: number;
  };
  submit: string;
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Название">
        <Input
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder="Например, индивидуальное занятие"
          required
        />
      </Field>
      <Field label="Тип">
        <Select name="kind" defaultValue={item?.kind ?? "subscription"}>
          <option value="subscription">Абонемент</option>
          <option value="single">Разовое</option>
          <option value="trial">Пробное</option>
        </Select>
      </Field>
      <Field label="Формат">
        <Select name="type" defaultValue={item?.type ?? "offline"}>
          <option value="offline">Офлайн</option>
          <option value="online">Онлайн</option>
        </Select>
      </Field>
      <Field label="Цена, ₽">
        <Input
          name="price"
          type="number"
          min={0}
          step={50}
          defaultValue={item?.price ?? 0}
          required
        />
      </Field>
      <Field label="Мин. занятий">
        <Input
          name="minLessons"
          type="number"
          min={1}
          step={1}
          defaultValue={item?.minLessons ?? 4}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-3">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink">
          <input
            name="active"
            type="checkbox"
            defaultChecked={item?.active ?? true}
            className="size-4 accent-[var(--color-brand)]"
          />
          Активен
        </label>
        <input
          type="hidden"
          name="sortOrder"
          value={item?.sortOrder ?? 100}
        />
        <SubmitButton size="sm" className="shrink-0">
          {submit}
        </SubmitButton>
      </div>
    </form>
  );
}

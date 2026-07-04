import {
  createPriceItem,
  deletePriceItem,
  updatePriceItem,
} from "@/lib/actions";
import { getPriceItems } from "@/lib/prices";
import { formatMoney } from "@/lib/domain";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { IconPlus, IconX } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const prices = await getPriceItems();
  const online = prices.filter((item) => item.type === "online");
  const offline = prices.filter((item) => item.type === "offline");

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
        <div className="grid gap-4 lg:grid-cols-2">
          <PriceFormatGroup title="Онлайн" items={online} />
          <PriceFormatGroup title="Офлайн" items={offline} />
        </div>
      </section>
    </div>
  );
}

function PriceFormatGroup({
  title,
  items,
}: {
  title: string;
  items: PriceItem[];
}) {
  const groups = [
    {
      title: "Индивидуальные",
      items: items.filter((item) => isIndividual(item)),
    },
    {
      title: "Групповые",
      items: items.filter((item) => !isIndividual(item) && item.kind !== "trial"),
    },
    {
      title: "Пробные",
      items: items.filter((item) => item.kind === "trial"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
      </div>
      <div className="divide-y divide-line">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="bg-brand-tint px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {group.title}
            </div>
            <div className="divide-y divide-line">
              {group.items.map((item) => (
                <PriceRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PriceRow({ item }: { item: PriceItem }) {
  return (
    <details className="group">
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
        <PriceForm action={updatePriceItem} item={item} submit="Сохранить" />
      </div>
    </details>
  );
}

type PriceItem = {
  id: number;
  name: string;
  kind: string;
  type: string;
  price: number;
  minLessons: number | null;
  active: boolean;
  sortOrder: number;
};

function isIndividual(item: { name: string }) {
  return item.name.toLowerCase().includes("индивиду");
}

function compactTitle(item: {
  name: string;
  kind: string;
  type: string;
  price: number;
  minLessons: number | null;
}) {
  const lessons =
    item.kind === "subscription" && item.minLessons
      ? ` от ${item.minLessons} занятий`
      : "";
  return `${item.name}, ${formatMoney(item.price)}${lessons}`;
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

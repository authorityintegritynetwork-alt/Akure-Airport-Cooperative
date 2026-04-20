import { useState } from "react";
import {
  useListStoreItems,
  useCreateStoreItem,
  useUpdateStoreItem,
  useDeleteStoreItem,
  getListStoreItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Edit, Trash2, Upload, ShoppingCart } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const storeItemSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  price: z.number({ error: "Price required" }).positive(),
  quantityAvailable: z.number().int().min(0).default(0),
});
type StoreItemForm = z.infer<typeof storeItemSchema>;

export function StoreAdminPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items, isLoading } = useListStoreItems({});
  const createItem = useCreateStoreItem();
  const updateItem = useUpdateStoreItem();
  const deleteItem = useDeleteStoreItem();

  const form = useForm<StoreItemForm>({
    resolver: zodResolver(storeItemSchema),
    defaultValues: { name: "", description: "", price: 0, quantityAvailable: 0 },
  });

  function openCreate() {
    setEditItem(null);
    setUploadedImagePath(null);
    setImageFile(null);
    form.reset({ name: "", description: "", price: 0, quantityAvailable: 0 });
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setUploadedImagePath(item.imageObjectPath || null);
    setImageFile(null);
    form.reset({ name: item.name, description: item.description || "", price: item.price, quantityAvailable: item.quantityAvailable });
    setDialogOpen(true);
  }

  async function handleImageUpload() {
    if (!imageFile) return;
    setImageUploading(true);
    try {
      const urlResp = await fetch(`${basePath}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: imageFile.name, size: imageFile.size, contentType: imageFile.type }),
      });
      if (!urlResp.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlResp.json();

      const uploadResp = await fetch(uploadURL, { method: "PUT", body: imageFile, headers: { "Content-Type": imageFile.type } });
      if (!uploadResp.ok) throw new Error("Image upload failed");

      setUploadedImagePath(objectPath);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  }

  function onSubmit(data: StoreItemForm) {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      price: data.price,
      quantityAvailable: data.quantityAvailable,
      imageObjectPath: uploadedImagePath || undefined,
    };

    const opts = {
      onSuccess: () => {
        toast({ title: editItem ? "Item updated" : "Item created" });
        queryClient.invalidateQueries({ queryKey: getListStoreItemsQueryKey({}) });
        setDialogOpen(false);
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    };

    if (editItem) {
      updateItem.mutate({ id: editItem.id, data: payload }, opts);
    } else {
      createItem.mutate({ data: payload }, opts);
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this item?")) return;
    deleteItem.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Item deleted" });
          queryClient.invalidateQueries({ queryKey: getListStoreItemsQueryKey({}) });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Store Management</h1>
        <Button onClick={openCreate} data-testid="button-create-store-item">
          <PlusCircle className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No store items yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map((item: any) => (
            <Card key={item.id} data-testid={`store-admin-item-${item.id}`} className="overflow-hidden">
              {item.imageObjectPath ? (
                <img
                  src={`${basePath}/api/storage/objects${item.imageObjectPath}`}
                  alt={item.name}
                  className="w-full h-36 object-cover"
                />
              ) : (
                <div className="w-full h-36 bg-muted flex items-center justify-center">
                  <ShoppingCart className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              <CardContent className="pt-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{item.name}</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(item.price)}</p>
                  </div>
                  <Badge variant={item.isAvailable ? "default" : "secondary"} className="text-xs">
                    {item.isAvailable ? "Available" : "Hidden"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Qty: {item.quantityAvailable}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(item)} data-testid={`button-edit-item-${item.id}`}>
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} data-testid={`button-delete-item-${item.id}`}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Store Item" : "Add Store Item"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input data-testid="input-item-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl><Input data-testid="input-item-description" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Price (₦)</FormLabel>
                  <FormControl>
                    <Input type="number" data-testid="input-item-price" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="quantityAvailable" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity Available</FormLabel>
                  <FormControl>
                    <Input type="number" data-testid="input-item-quantity" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <label className="text-sm font-medium">Product Image (optional)</label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    data-testid="input-item-image"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleImageUpload} disabled={!imageFile || imageUploading} data-testid="button-upload-image">
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
                {uploadedImagePath && (
                  <div className="flex items-center gap-2 text-xs text-primary">
                    <img src={`${basePath}/api/storage/objects${uploadedImagePath}`} alt="" className="w-10 h-10 object-cover rounded" />
                    <span>Image uploaded</span>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createItem.isPending || updateItem.isPending} data-testid="button-submit-store-item">
                {editItem ? "Update Item" : "Create Item"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

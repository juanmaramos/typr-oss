import { zodResolver } from "@hookform/resolvers/zod";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTypr } from "@/contexts";
import { commands as dbCommands, type Human, type Organization } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@typr/ui/components/ui/form";
import { Input } from "@typr/ui/components/ui/input";

const schema = z.object({
  fullName: z.string().min(2).max(50).optional(),
  // Hidden for now - only used for advanced features
  jobTitle: z.string().min(2).max(50).optional(),
  companyName: z.string().min(2).max(50).optional(), // Made optional
  companyDescription: z.string().min(2).max(500).optional(),
  linkedinUserName: z.string().min(2).max(50).optional(),
});

type Schema = z.infer<typeof schema>;

export default function ProfileComponent() {
  const { t } = useLingui();
  const { userId } = useTypr();
  const queryClient = useQueryClient();

  const config = useQuery({
    enabled: !!userId,
    queryKey: ["config", "profile", userId],
    queryFn: async () => {
      const [human, organization] = await Promise.all([
        dbCommands.getHuman(userId),
        dbCommands.getOrganizationByUserId(userId),
      ]);

      return { human: human!, organization };
    },
  });

  const form = useForm<Schema>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      jobTitle: "",
      companyName: "",
      companyDescription: "",
      linkedinUserName: "",
    },
  });

  useEffect(() => {
    if (config.data) {
      form.reset({
        fullName: config.data.human?.full_name ?? "",
        // Initialize hidden fields to prevent form errors
        jobTitle: config.data.human?.job_title ?? "",
        companyName: config.data.organization?.name ?? "",
        companyDescription: config.data.organization?.description ?? "",
        linkedinUserName: config.data.human?.linkedin_username ?? "",
      });
    }
  }, [config.data, form]);

  const mutation = useMutation({
    mutationFn: async (v: Schema) => {
      if (!config.data) {
        console.error("cannot mutate profile because it is not loaded");
        return;
      }

      const orgId = config.data.organization?.id ?? crypto.randomUUID();

      const newOrganization: Organization = {
        id: orgId,
        name: v.companyName ?? "",
        description: v.companyDescription ?? null,
      };

      const newHuman: Human = {
        ...config.data.human!,
        full_name: v.fullName ?? null,
        job_title: v.jobTitle ?? null,
        email: config.data.human?.email ?? null,
        linkedin_username: v.linkedinUserName ?? null,
        organization_id: orgId,
      };

      await dbCommands.upsertOrganization(newOrganization);
      await dbCommands.upsertHuman(newHuman);
    },
    onError: console.error,
    onSuccess: () => {
      // Invalidate profile queries - broadcast system handles cross-window sync
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey)
          && query.queryKey.includes("profile"),
      });
    },
  });
  // Save function to call on blur
  const handleSave = () => {
    if (config.data && form.formState.isDirty) {
      mutation.mutate(form.getValues());
    }
  };

  // Manual save function for button
  const handleManualSave = () => {
    if (config.data) {
      mutation.mutate(form.getValues());
    }
  };

  // Auto-clear success state after 2 seconds
  useEffect(() => {
    if (mutation.isSuccess) {
      const timer = setTimeout(() => {
        mutation.reset();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [mutation.isSuccess]);

  // Save on window close/unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (config.data && form.formState.isDirty) {
        mutation.mutate(form.getValues());
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [config.data, form, mutation]);

  return (
    <div>
      <Form {...form}>
        <form className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Full name</Trans>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t`Enter your full name`}
                    {...field}
                    onBlur={handleSave}
                    className="w-60 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="jobTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Job title</Trans>
                </FormLabel>
                <FormDescription>
                  <Trans>Helps AI provide better context in meeting summaries</Trans>
                </FormDescription>
                <FormControl>
                  <Input
                    placeholder={t`Enter your job title`}
                    {...field}
                    onBlur={handleSave}
                    className="w-60 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Company name</Trans>
                </FormLabel>
                <FormDescription>
                  <Trans>Provides business context for AI-generated notes</Trans>
                </FormDescription>
                <FormControl>
                  <Input
                    placeholder={t`Enter company name`}
                    {...field}
                    onBlur={handleSave}
                    className="w-60 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hidden advanced fields - can be restored later */}
          {
            /*
          <FormField
            control={form.control}
            name="companyDescription"
            render={({ field }) => (
              <FormItem className="max-w-lg">
                <div>
                  <FormLabel>
                    <Trans>Company description</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>This is a short description of your company.</Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <Textarea
                    placeholder={t`We think different.`}
                    {...field}
                    className="focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="linkedinUserName"
            render={({ field }) => (
              <FormItem className="max-w-sm">
                <div>
                  <FormLabel>
                    <Trans>LinkedIn username</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>
                      Your LinkedIn username (the part after linkedin.com/in/)
                    </Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                      linkedin.com/in/
                    </span>
                    <Input
                      className="rounded-l-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder={t`username`}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          */
          }
        </form>
      </Form>

      {/* Manual Save Button */}
      <div className="mt-6">
        <Button
          onClick={handleManualSave}
          disabled={mutation.isPending}
          variant="default"
          size="sm"
        >
          {mutation.isPending
            ? (
              <>
                <i className="ri-loader-4-line animate-spin mr-2" />
                <Trans>Saving...</Trans>
              </>
            )
            : <Trans>Save Profile</Trans>}
        </Button>
      </div>

      {/* Save status feedback */}
      {(mutation.isPending || mutation.isSuccess || mutation.isError) && (
        <div className="mt-4 text-sm">
          {mutation.isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <i className="ri-loader-4-line animate-spin" />
              <Trans>Saving...</Trans>
            </div>
          )}
          {mutation.isSuccess && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <i className="ri-checkbox-circle-fill text-success" />
              <Trans>Profile saved</Trans>
            </div>
          )}
          {mutation.isError && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <i className="ri-error-warning-fill text-destructive" />
              <Trans>Failed to save profile</Trans>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Search } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminBookingsPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [searchDesk, setSearchDesk] = useState("");
  const [searchUser, setSearchUser] = useState("");

  const { data: sites = [] } = api.facility.list.useQuery();

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div>
        <h1 className="type-page-title">Booking Management</h1>
        <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm leading-6">View and manage all bookings across your facilities.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Bookings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Facility</label>
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="All facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All facilities</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Search Desk</label>
            <Input
              placeholder="Desk number..."
              value={searchDesk}
              onChange={(e) => setSearchDesk(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Search User</label>
            <Input
              placeholder="User name..."
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bookings Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Bookings</CardTitle>
          <CardDescription>Manage bookings across all facilities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            <div className="flex items-center justify-center gap-2">
              <Search className="size-4" />
              <span>Booking admin view ready to integrate with real booking data</span>
            </div>
            <p className="text-xs mt-2">This interface displays all bookings for the facility admin to review and cancel as needed.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

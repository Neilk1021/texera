/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Component, EventEmitter, inject, OnDestroy, OnInit, Output } from "@angular/core";
import { catchError, forkJoin, Observable, of, tap } from "rxjs";
import { FormBuilder, FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { ShareAccessService } from "../../../service/user/share-access/share-access.service";
import { Privilege, ShareAccess } from "../../../type/share-access.interface";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { UserService } from "../../../../common/service/user/user.service";
import { GmailService } from "../../../../common/service/gmail/gmail.service";
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from "ng-zorro-antd/modal";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { HttpErrorResponse } from "@angular/common/http";
import { USER_DATASET, USER_PROJECT, USER_WORKFLOW, USER_WORKSPACE } from "../../../../app-routing.constant";
import { NzMessageService } from "ng-zorro-antd/message";
import { DatasetService } from "../../../service/user/dataset/dataset.service";
import { WorkflowPersistService } from "src/app/common/service/workflow-persist/workflow-persist.service";
import { WorkflowActionService } from "src/app/workspace/service/workflow-graph/model/workflow-action.service";
import { NgIf, NgFor } from "@angular/common";
import { NzSpaceCompactItemDirective } from "ng-zorro-antd/space";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { ɵNzTransitionPatchDirective } from "ng-zorro-antd/core/transition-patch";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzCardComponent } from "ng-zorro-antd/card";
import { NzRowDirective, NzColDirective } from "ng-zorro-antd/grid";
import { NzFormItemComponent, NzFormLabelComponent, NzFormControlComponent } from "ng-zorro-antd/form";
import { NzInputDirective } from "ng-zorro-antd/input";
import { NzAutocompleteTriggerDirective, NzAutocompleteComponent } from "ng-zorro-antd/auto-complete";
import { NzTagComponent } from "ng-zorro-antd/tag";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import { NzDropdownDirective, NzDropdownMenuComponent } from "ng-zorro-antd/dropdown";
import { NzMenuDirective, NzMenuDividerDirective, NzMenuItemComponent } from "ng-zorro-antd/menu";
import { Router } from "@angular/router";
import { PanelService } from "src/app/workspace/service/panel/panel.service";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";

@UntilDestroy()
@Component({
  selector: "texera-share-access",
  templateUrl: "share-access.component.html",
  styleUrls: ["./share-access.component.scss"],
  imports: [
    NgIf,
    NzSpaceCompactItemDirective,
    NzButtonComponent,
    NzWaveDirective,
    ɵNzTransitionPatchDirective,
    NzIconDirective,
    FormsModule,
    ReactiveFormsModule,
    NzCardComponent,
    NzRowDirective,
    NzFormItemComponent,
    NzColDirective,
    NzFormLabelComponent,
    NzFormControlComponent,
    NzInputDirective,
    NzAutocompleteTriggerDirective,
    NzAutocompleteComponent,
    NgFor,
    NzTagComponent,
    NzTooltipDirective,
    NzDropdownDirective,
    NzDropdownMenuComponent,
    NzMenuDirective,
    NzMenuItemComponent,
    NzMenuDividerDirective,
    UserAvatarComponent,
  ],
})
export class ShareAccessComponent implements OnInit, OnDestroy {
  readonly nzModalData = inject(NZ_MODAL_DATA);
  readonly type: string = this.nzModalData.type;
  readonly id: number = this.nzModalData.id;
  readonly allOwners: string[] = this.nzModalData.allOwners;
  readonly inWorkspace: boolean = this.nzModalData.inWorkspace;
  readonly entityName: string = this.nzModalData.name ?? "";
  public validateForm: FormGroup;
  public accessList: ReadonlyArray<ShareAccess> = [];
  public owner: string = "";
  public filteredOwners: Array<string> = [];
  public ownerSearchValue?: string;
  public emailTags: string[] = [];
  currentEmail: string | undefined = "";
  isPublic: boolean | null = null;
  private shouldRefresh = false;
  @Output() refresh = new EventEmitter<void>();

  constructor(
    private accessService: ShareAccessService,
    private formBuilder: FormBuilder,
    private userService: UserService,
    private gmailService: GmailService,
    private notificationService: NotificationService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private workflowPersistService: WorkflowPersistService,
    private datasetService: DatasetService,
    private workflowActionService: WorkflowActionService,
    private modalRef: NzModalRef,
    private router: Router,
    private panelService: PanelService
  ) {
    this.validateForm = this.formBuilder.group({
      email: [null, Validators.email],
      accessLevel: ["WRITE"],
    });
    this.currentEmail = this.userService.getCurrentUser()?.email;
  }

  get hasWriteAccess(): boolean {
    if (!this.currentEmail) {
      return false;
    }
    if (this.currentEmail === this.owner) {
      return true;
    }
    const currentUserAccess = this.accessList.find(entry => entry.email === this.currentEmail);
    return currentUserAccess?.privilege === Privilege.WRITE;
  }

  /** The redesigned dialog only covers workflows; the other types keep the previous layout. */
  get isWorkflowShare(): boolean {
    return this.type === "workflow";
  }

  get dialogTitle(): string {
    return this.entityName ? `Share workflow “${this.entityName}”` : "Share workflow";
  }

  get visibilityLabel(): string {
    return this.isPublic ? "Public" : "Private";
  }

  get visibilityHint(): string {
    return this.isPublic
      ? `Anyone can find, view and clone this ${this.type} on Texera Hub.`
      : "Users cannot view this on Texera Hub.";
  }

  public privilegeLabel(privilege: Privilege): string {
    return privilege === Privilege.WRITE ? "Write" : "Read";
  }

  public setVisibility(makePublic: boolean): void {
    if (makePublic) {
      this.verifyPublish();
    } else {
      this.verifyUnpublish();
    }
  }

  /** The access level new collaborators will be granted. */
  get inviteLevel(): string {
    return this.validateForm.value.accessLevel;
  }

  get inviteLevelLabel(): string {
    return this.inviteLevel === Privilege.WRITE ? "Write" : "Read";
  }

  public setInviteLevel(level: string): void {
    this.validateForm.patchValue({ accessLevel: level });
  }

  /** Whether the collaborator box holds anything that can still be shared. */
  get hasPendingInvite(): boolean {
    return this.emailTags.length > 0 || !!this.validateForm.get("email")?.value;
  }

  /** Re-reads the owner, access list and publish state, picking up other users' changes. */
  public reloadAccessList(): void {
    this.ngOnInit();
  }

  /**
   * Adds whatever is in the collaborator box as collaborators. Access is granted right away so the
   * new collaborators show up in the list below, matching how the rest of this dialog behaves.
   */
  public onCollaboratorInputConfirm(event?: Event): void {
    this.handleInputConfirm(event);
    this.grantAccess();
  }

  public onClickEditVersion(): void {
    this.panelService.openVersionsPanel();
    this.modalRef.close();
    if (!this.inWorkspace) {
      this.router.navigate([USER_WORKSPACE, this.id]);
    }
  }

  /**
   * Closes the dialog. Emails that were typed but never confirmed are granted first, and the close
   * is deferred until those requests settle — closing destroys this component, which would cancel
   * them mid-flight.
   */
  public onClickDone(): void {
    this.handleInputConfirm();
    const pendingEmails = this.emailTags;
    if (pendingEmails.length === 0) {
      this.modalRef.close();
      return;
    }
    this.emailTags = [];
    // Deliberately not tied to untilDestroyed: this subscription is what closes the dialog, so
    // tearing it down on destroy would cancel the very requests it is waiting for.
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    forkJoin(pendingEmails.map(email => this.grantAccessTo(email).pipe(catchError(() => of(null))))).subscribe(() =>
      this.modalRef.close()
    );
  }

  ngOnInit(): void {
    this.accessService
      .getAccessList(this.type, this.id)
      .pipe(untilDestroyed(this))
      .subscribe(access => (this.accessList = access));
    this.accessService
      .getOwner(this.type, this.id)
      .pipe(untilDestroyed(this))
      .subscribe(name => {
        this.owner = name;
      });
    if (this.type === "workflow") {
      this.workflowPersistService
        .getWorkflowIsPublished(this.id)
        .pipe(untilDestroyed(this))
        .subscribe(dashboardWorkflow => {
          this.isPublic = dashboardWorkflow === "Public";
        });
    } else if (this.type === "dataset") {
      this.datasetService
        .getDataset(this.id)
        .pipe(untilDestroyed(this))
        .subscribe(dashboardDataset => {
          this.isPublic = dashboardDataset.dataset.isPublic;
        });
    }
  }

  ngOnDestroy(): void {
    if (this.shouldRefresh) {
      this.refresh.emit();
    }
  }

  public handleInputConfirm(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    const emailInput = this.validateForm.get("email")?.value;

    if (emailInput) {
      const emailArray: string[] = emailInput.split(/[\s,;]+/);
      emailArray.forEach(email => {
        if (email) {
          const emailControl = new FormControl(email, Validators.email);
          if (!emailControl.errors && !this.emailTags.includes(email)) {
            this.emailTags.push(email);
          } else if (this.emailTags.includes(email)) {
            this.message.error(`${email} is already in the tags`);
          } else {
            this.message.error(`${email} is not a valid email`);
          }
        }
      });
    }

    this.validateForm.get("email")?.reset();
  }

  public removeEmailTag(email: string): void {
    this.emailTags = this.emailTags.filter(tag => tag !== email);
  }

  public grantAccess(): void {
    this.handleInputConfirm();
    if (this.emailTags.length > 0) {
      // Failures are already surfaced by grantAccessTo, so the error callback only stops RxJS from
      // reporting them as unhandled.
      this.emailTags.forEach(email =>
        this.grantAccessTo(email)
          .pipe(untilDestroyed(this))
          .subscribe({ error: () => {} })
      );
      this.emailTags = [];
    }
  }

  /**
   * Grants the configured access level to a single email, notifying the recipient on success. The
   * returned observable is cold: callers decide the subscription's lifetime.
   */
  private grantAccessTo(email: string): Observable<void> {
    let message = `${this.userService.getCurrentUser()?.email} shared a ${this.type} with you`;
    if (this.type !== "computing-unit") {
      let routePath = "";
      if (this.type === "workflow") routePath = USER_WORKFLOW;
      if (this.type === "dataset") routePath = USER_DATASET;
      if (this.type === "project") routePath = USER_PROJECT;
      message += `, access the ${this.type} at ${location.origin}${routePath}/${this.id}`;
    }
    return this.accessService.grantAccess(this.type, this.id, email, this.validateForm.value.accessLevel).pipe(
      tap({
        next: () => {
          this.notificationService.success(this.type + " shared with " + email + " successfully.");
          this.gmailService.sendEmail(
            "Texera: " + this.userService.getCurrentUser()?.email + " shared a " + this.type + " with you",
            message,
            email
          );
          this.ngOnInit();
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            this.notificationService.error(error.error.message);
          }
        },
      })
    );
  }

  public onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasteData = event.clipboardData?.getData("text");
    if (pasteData) {
      const currentEmailValue = this.validateForm.get("email")?.value || "";
      // concaste new emails and old emails
      const newValue = currentEmailValue + pasteData;
      this.validateForm.get("email")?.setValue(newValue);
      this.handleInputConfirm();
    }
  }

  public onChange(value: string): void {
    if (value === null || value === undefined) {
      this.filteredOwners = [];
    } else {
      this.filteredOwners = this.allOwners.filter(owner => owner.toLowerCase().indexOf(value.toLowerCase()) !== -1);
    }
  }

  public verifyRevokeAccess(userToRemove: string): void {
    const isRevokingOwnAccess = userToRemove === this.userService.getCurrentUser()?.email;
    const modalTitle = isRevokingOwnAccess ? "Revoke Your Access" : "Revoke Access";
    const modalContent = isRevokingOwnAccess
      ? `Are you sure you want to revoke your own access to this ${this.type}? You will no longer be able to view or edit it.`
      : `Are you sure you want to revoke ${userToRemove}'s access to this ${this.type}?`;

    const modal: NzModalRef = this.modalService.create({
      nzTitle: modalTitle,
      nzContent: modalContent,
      nzFooter: [
        {
          label: "Cancel",
          onClick: () => modal.close(),
        },
        {
          label: "Revoke",
          type: "primary",
          danger: true,
          onClick: () => {
            this.revokeAccess(userToRemove);
            modal.close();
          },
        },
      ],
    });
  }

  private revokeAccess(userToRemove: string): void {
    this.accessService
      .revokeAccess(this.type, this.id, userToRemove)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: () => {
          if (userToRemove == this.userService.getCurrentUser()?.email) {
            this.shouldRefresh = true;
            this.modalRef.close({ userRevokedOwnAccess: true });
          }
          this.ngOnInit();
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            this.notificationService.error(error.error.message);
          }
        },
      });
  }

  public changeAccessLevel(email: string, newPrivilege: string): void {
    const isOwnAccess = email === this.currentEmail;
    const currentUserAccess = this.accessList.find(entry => entry.email === email);
    const isDowngrade = currentUserAccess?.privilege === Privilege.WRITE && newPrivilege === "READ";

    if (isOwnAccess && isDowngrade) {
      const modal: NzModalRef = this.modalService.create({
        nzTitle: "Downgrade Your Access",
        nzContent: `Are you sure you want to change your own access to READ? You will no longer be able to edit this ${this.type} or manage access.`,
        nzFooter: [
          {
            label: "Cancel",
            onClick: () => {
              modal.close();
              this.ngOnInit();
            },
          },
          {
            label: "Confirm",
            type: "primary",
            danger: true,
            onClick: () => {
              this.applyAccessLevelChange(email, newPrivilege);
              modal.close();
            },
          },
        ],
      });
    } else {
      this.applyAccessLevelChange(email, newPrivilege);
    }
  }

  private applyAccessLevelChange(email: string, newPrivilege: string): void {
    this.accessService
      .grantAccess(this.type, this.id, email, newPrivilege)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: () => {
          this.notificationService.success(`Access level for ${email} changed to ${newPrivilege}.`);
          this.ngOnInit();
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            this.notificationService.error(error.error.message);
          }
          this.ngOnInit();
        },
      });
  }

  public verifyPublish(): void {
    if (!this.isPublic) {
      const modal: NzModalRef = this.modalService.create({
        nzTitle: "Notice",
        nzContent: `Publishing your ${this.type} would grant all Texera users read access to your  ${this.type} along with the right to clone your work.`,
        nzFooter: [
          {
            label: "Cancel",
            onClick: () => modal.close(),
          },
          {
            label: "Publish",
            type: "primary",
            onClick: () => {
              if (this.type === "workflow") {
                this.publishWorkflow();

                if (this.inWorkspace) {
                  this.workflowActionService.setWorkflowIsPublished(1);
                }
              } else if (this.type === "dataset") {
                this.publishDataset();
              }
              modal.close();
            },
          },
        ],
      });
    }
  }

  public verifyUnpublish(): void {
    if (this.isPublic) {
      const modal: NzModalRef = this.modalService.create({
        nzTitle: "Notice",
        nzContent: `All other users would lose access to your ${this.type} if you unpublish it.`,
        nzFooter: [
          {
            label: "Cancel",
            onClick: () => modal.close(),
          },
          {
            label: "Unpublish",
            type: "primary",
            onClick: () => {
              if (this.type === "workflow") {
                this.unpublishWorkflow();
                if (this.inWorkspace) {
                  this.workflowActionService.setWorkflowIsPublished(0);
                }
              } else if (this.type === "dataset") {
                this.unpublishDataset();
              }
              modal.close();
            },
          },
        ],
      });
    }
  }

  public publishWorkflow(): void {
    if (!this.isPublic) {
      this.workflowPersistService
        .updateWorkflowIsPublished(this.id, true)
        .pipe(untilDestroyed(this))
        .subscribe({
          next: () => {
            this.isPublic = true;
            this.notificationService.success("Workflow published successfully");
          },
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse) {
              this.notificationService.error(error.error.message);
            }
          },
        });
    }
  }

  public unpublishWorkflow(): void {
    if (this.isPublic) {
      this.workflowPersistService
        .updateWorkflowIsPublished(this.id, false)
        .pipe(untilDestroyed(this))
        .subscribe({
          next: () => {
            this.isPublic = false;
            this.notificationService.success("Workflow unpublished successfully");
          },
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse) {
              this.notificationService.error(error.error.message);
            }
          },
        });
    }
  }

  public publishDataset(): void {
    if (!this.isPublic) {
      this.datasetService
        .updateDatasetPublicity(this.id)
        .pipe(untilDestroyed(this))
        .subscribe({
          next: (res: Response) => {
            this.isPublic = true;
            this.notificationService.success("Dataset published successfully");
          },
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse) {
              this.notificationService.error(error.error.message);
            }
          },
        });
    }
  }

  public unpublishDataset(): void {
    if (this.isPublic) {
      this.datasetService
        .updateDatasetPublicity(this.id)
        .pipe(untilDestroyed(this))
        .subscribe({
          next: (res: Response) => {
            this.isPublic = false;
            this.notificationService.success("Dataset unpublished successfully");
          },
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse) {
              this.notificationService.error(error.error.message);
            }
          },
        });
    }
  }
}
